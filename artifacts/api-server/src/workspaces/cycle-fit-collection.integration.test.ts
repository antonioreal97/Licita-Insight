import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { dropTestDatabase } from "./drop-test-database";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, "../../../../lib/db/migrations");
const LOCK_KEY = "licitai:workspace-cutover";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Opt-in: creates and drops its own database next to PNCP_TEST_DATABASE_URL, so the cutover flag is its own.
test("fit jobs, collection notifications and profile alerts under the cutover flag", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  const databaseName = `licita_ws_e1_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const databaseUrl = (name: string): string => {
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.pathname = `/${name}`;
    url.searchParams.delete("options");
    return url.toString();
  };
  const admin = new pg.Client({ connectionString: databaseUrl("postgres") });
  await admin.connect();
  await admin.query(`create database "${databaseName}"`);
  const owner = new pg.Pool({ connectionString: databaseUrl(databaseName), max: 4 });
  await migrate(drizzle(owner), { migrationsFolder });

  process.env.DATABASE_URL = databaseUrl(databaseName);
  process.env.PUBLIC_APP_ORIGIN = "http://localhost:24252";
  process.env.AUTH_DEV_LOGIN = "true";
  process.env.SESSION_SECRET = "workspace-e1-integration-secret-at-least-32-characters";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.APP_ROLE = "all";
  process.env.JEV_API_KEY = "test-key";
  process.env.AI_FIT_LEXICAL_GATE = "off";
  process.env.AI_JOB_POLL_MS = "50";
  for (const name of ["RATE_LIMIT_AUTH_PER_MINUTE", "RATE_LIMIT_USER_PER_MINUTE", "RATE_LIMIT_WRITE_PER_MINUTE", "RATE_LIMIT_AI_PER_MINUTE"]) {
    process.env[name] = "10000";
  }
  for (const name of ["BILLING_MONTHLY_BRL", "BILLING_DEV_ENTITLED", "RESEND_API_KEY", "OPENAI_API_KEY"]) delete process.env[name];

  /**
   * The scoring service, played locally and installed before any module can keep a reference to `fetch`: every fit is
   * "the company supplies the main object". Only the API under test, on the loopback, is reached over the network.
   */
  const realFetch = globalThis.fetch;
  let scoringCalls = 0;
  let beforeScoreAnswers: (() => Promise<void>) | undefined;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("http://127.0.0.1:")) return realFetch(input, init);
    scoringCalls += 1;
    const hook = beforeScoreAnswers;
    beforeScoreAnswers = undefined;
    await hook?.();
    return Response.json({
      model: "jev-test",
      answers: { aderencia: { type: "score", score: 2.7, confidence: 0.9, legend: {}, probabilities: {} } },
      usage: { input_tokens: 1_100, output_tokens: 0 },
    });
  };

  const { db, pool, companyProfilesTable, workspaceProfilesTable } = await import("@workspace/db");
  const { default: app } = await import("../app");
  const { upsertPublications } = await import("../ingest/upsert-tenders");
  const { createDocumentAddedNotifications } = await import("../account/notification-service");
  const { evaluateProfileAlertNotifications } = await import("../ai/company-fit-service");
  const { runEnqueuedAiJobNow, startAiJobWorker } = await import("../ai/ai-job-queue");
  const { CutoverPausedError } = await import("./cutover-cycle");
  const { withCutoverGate } = await import("./cutover-gate");
  const { createWorkspace, defaultWorkspaceId } = await import("./workspace-service");
  const { companyProfileToWorkspaceProfile } = await import("./workspace-profile-service");

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  t.after(async () => {
    globalThis.fetch = realFetch;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await pool.end();
    await owner.end();
    await dropTestDatabase(admin, databaseName);
    await admin.end();
  });

  const csrf = { Origin: "http://localhost:24252", "X-Requested-With": "licita-insight" };
  const request = (path: string, init: RequestInit = {}, cookie?: string): Promise<Response> =>
    fetch(`${baseUrl}/api${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...init.headers,
      },
    });
  const send = (method: string, path: string, cookie: string, body?: unknown) =>
    request(path, { method, headers: csrf, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, cookie);
  const json = async (response: Promise<Response>) => (await response).json() as Promise<any>;
  const setState = (mode: "legacy" | "workspaces", writesPaused: boolean) =>
    owner.query(
      "insert into workspace_cutover_events (mode, writes_paused, actor, reason) values ($1, $2, 'teste', 'TEST')",
      [mode, writesPaused],
    );
  const one = async (text: string, values: unknown[] = []) => (await owner.query(text, values)).rows[0];
  const all = async (text: string, values: unknown[] = []) => (await owner.query(text, values)).rows;

  const profile = {
    description: "Fornecemos equipamentos de informática e suporte técnico corporativo.",
    offerings: ["computadores", "suporte técnico"],
    exclusions: [],
    selectedCategories: [],
    selectedKeywords: [],
    excludedKeywords: [],
    coverage: { scope: "national", mode: "strict", acceptsRemote: false },
    valueRange: { min: null, max: null },
    size: "me_epp",
  };
  /** A subscribed account with a company profile and, like every account by the cutover, a default workspace. */
  const account = async (email: string) => {
    const response = await request("/v1/auth/dev-login", { method: "POST", headers: csrf, body: JSON.stringify({ email, name: "TEST USER" }) });
    assert.equal(response.status, 204);
    const cookie = response.headers.get("set-cookie")!.split(";", 1)[0]!;
    const userId = (await json(request("/v1/auth/session", {}, cookie))).user.id as string;
    await owner.query("insert into subscriptions (user_id, status, current_period_end) values ($1, 'active', '2099-01-01T00:00:00Z')", [userId]);
    if (!(await one("select 1 as found from workspaces where owner_user_id = $1", [userId]))) {
      await withCutoverGate({ kind: "http" }, (tx) =>
        createWorkspace(tx, { ownerUserId: userId, type: "procurement", name: "Compras públicas", isDefault: true }),
      );
    }
    assert.equal((await send("PUT", "/v1/me/company-profile", cookie, profile)).status, 200);
    return { cookie, userId, workspaceId: defaultWorkspaceId(userId) };
  };
  /** What the W3 delta does for these accounts inside the cutover transaction, then the mode switch. */
  const cutToWorkspaces = async (userIds: string[], skip: string[] = []) => {
    const cutter = await owner.connect();
    try {
      await cutter.query("begin");
      await cutter.query("set local lock_timeout = '5s'");
      await cutter.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [LOCK_KEY]);
      for (const userId of userIds) {
        const workspaceId = defaultWorkspaceId(userId);
        const [legacy] = await drizzle(cutter).select().from(companyProfilesTable).where(eq(companyProfilesTable.userId, userId));
        if (legacy) {
          const converted = companyProfileToWorkspaceProfile(legacy);
          await drizzle(cutter)
            .insert(workspaceProfilesTable)
            .values({ workspaceId, ...converted })
            .onConflictDoUpdate({ target: workspaceProfilesTable.workspaceId, set: converted });
        }
        for (const table of ["company_tender_fits", "ai_jobs", "saved_tenders", "notifications"].filter((name) => !skip.includes(name))) {
          await cutter.query(`update ${table} set workspace_id = $1 where user_id = $2 and workspace_id is null`, [workspaceId, userId]);
        }
      }
      await cutter.query(
        "insert into workspace_cutover_events (mode, writes_paused, actor, reason) values ('workspaces', false, 'teste', 'cut: TEST')",
      );
      await cutter.query("commit");
    } finally {
      cutter.release();
    }
  };

  const tenderIdOf = (sequence: number) => `00394460000141-1-${String(sequence).padStart(6, "0")}-2026`;
  const publication = (sequence: number, overrides: Record<string, unknown> = {}) => ({
    numeroControlePNCP: `00394460000141-1-${String(sequence).padStart(6, "0")}/2026`,
    objetoCompra: `Aquisição de computadores para TEST DATA ${sequence}`,
    numeroCompra: String(sequence),
    anoCompra: 2026,
    modalidadeId: 6,
    modalidadeNome: "Pregão - Eletrônico",
    situacaoCompraNome: "Divulgada no PNCP",
    dataPublicacaoPncp: "2026-09-20T09:00:00",
    dataEncerramentoProposta: `2099-10-${String(sequence).padStart(2, "0")}T17:00:00`,
    dataAtualizacao: "2026-09-23T10:00:00",
    valorTotalEstimado: 100,
    orcamentoSigilosoCodigo: 1,
    orgaoEntidade: { cnpj: "00394460000141", razaoSocial: "Órgão de teste" },
    unidadeOrgao: { ufSigla: "DF", municipioNome: "Brasília" },
    ...overrides,
  });
  await upsertPublications(Array.from({ length: 9 }, (_, index) => publication(index + 1)), new Date());
  await owner.query("update tenders set created_at = '2026-09-01T00:00:00Z'");

  /** Asks for a fit over the route, which queues the job, and returns what was stored for it. */
  const queueFit = async (who: { cookie: string; userId: string }, tenderId: string) => {
    const answer = await json(request(`/v1/me/fit?tenderIds=${encodeURIComponent(tenderId)}`, {}, who.cookie));
    assert.equal(answer.results[tenderId].status, "pending");
    const job = await one(
      "select j.id, j.dedupe_key, j.workspace_id, j.payload->>'fitId' as fit_id from ai_jobs j where j.kind = 'fit' and j.user_id = $1 and j.tender_id = $2",
      [who.userId, tenderId],
    );
    return job as { id: string; dedupe_key: string; workspace_id: string | null; fit_id: string };
  };
  const jobRow = (id: string) => one("select status, attempts, workspace_id, last_error from ai_jobs where id = $1", [id]);
  const fitRow = (id: string) => one("select status, level, workspace_id from company_tender_fits where id = $1", [id]);
  const runNow = async (job: { id: string; dedupe_key: string }) => {
    await owner.query("update ai_jobs set run_after = now() where id = $1", [job.id]);
    return runEnqueuedAiJobNow(job.dedupe_key);
  };

  await t.test("legacy: a fit job runs as today and writes no workspace", async () => {
    const legacy = await account("e1-legacy@example.test");
    const job = await queueFit(legacy, tenderIdOf(1));
    assert.equal(job.workspace_id, null);
    assert.equal(await runNow(job), true);
    assert.deepEqual(await jobRow(job.id), { status: "succeeded", attempts: 1, workspace_id: null, last_error: null });
    assert.deepEqual(await fitRow(job.fit_id), { status: "ready", level: "high", workspace_id: null });
  });

  const queued = await account("e1-queued@example.test");
  const orphan = await account("e1-orphan@example.test");
  const crossing = await account("e1-crossing@example.test");
  const queuedJob = await queueFit(queued, tenderIdOf(1));
  const orphanJob = await queueFit(orphan, tenderIdOf(1));
  const crossingJob = await queueFit(crossing, tenderIdOf(1));

  await t.test("a fit job that crosses the cutover drops its result, keeps its attempt and runs again in the new model", async () => {
    const before = scoringCalls;
    // The job read `legacy`; the cutover commits while the scoring call is out, before the job writes.
    beforeScoreAnswers = () => cutToWorkspaces([queued.userId, crossing.userId]);
    assert.equal(await runEnqueuedAiJobNow(crossingJob.dedupe_key), true);
    assert.equal(scoringCalls, before + 1);
    assert.deepEqual(await jobRow(crossingJob.id), { status: "queued", attempts: 0, workspace_id: crossing.workspaceId, last_error: null });
    assert.deepEqual(await fitRow(crossingJob.fit_id), { status: "processing", level: null, workspace_id: crossing.workspaceId });

    assert.equal(await runNow(crossingJob), true);
    assert.deepEqual(await jobRow(crossingJob.id), { status: "succeeded", attempts: 1, workspace_id: crossing.workspaceId, last_error: null });
    assert.deepEqual(await fitRow(crossingJob.fit_id), { status: "ready", level: "high", workspace_id: crossing.workspaceId });
  });

  await t.test("a fit job queued before the cutover runs after it in the workspace the delta assigned", async () => {
    assert.equal(await runNow(queuedJob), true);
    assert.deepEqual(await jobRow(queuedJob.id), { status: "succeeded", attempts: 1, workspace_id: queued.workspaceId, last_error: null });
    assert.deepEqual(await fitRow(queuedJob.fit_id), { status: "ready", level: "high", workspace_id: queued.workspaceId });
    const answer = await json(request(`/v1/me/fit?tenderIds=${encodeURIComponent(tenderIdOf(1))}`, {}, queued.cookie));
    assert.equal(answer.results[tenderIdOf(1)].status, "ready");
  });

  await t.test("a fit job without a workspace after the cutover dies with the explicit error, never ignored", async () => {
    // Everything of this account was assigned but the job: the gap the rule exists for.
    await cutToWorkspaces([orphan.userId], ["ai_jobs"]);
    const before = scoringCalls;
    assert.equal(await runNow(orphanJob), true);
    assert.equal(scoringCalls, before, "no scoring call for it");
    assert.deepEqual(await jobRow(orphanJob.id), {
      status: "dead",
      attempts: 1,
      workspace_id: null,
      last_error: "TerminalAiJobError: fit job without workspace_id after cutover",
    });
    assert.equal((await fitRow(orphanJob.fit_id)).status, "processing", "nothing written");
  });

  await t.test("workspaces: a removed membership cancels the fit job without reading the workspace", async () => {
    const removed = await account("e1-removed@example.test");
    const job = await queueFit(removed, tenderIdOf(2));
    assert.equal(job.workspace_id, removed.workspaceId);
    await owner.query("delete from workspace_members where workspace_id = $1 and user_id = $2", [removed.workspaceId, removed.userId]);
    const before = scoringCalls;
    assert.equal(await runNow(job), true);
    assert.equal(scoringCalls, before);
    assert.equal((await jobRow(job.id)).status, "succeeded");
    assert.equal((await fitRow(job.fit_id)).status, "processing");
  });

  await t.test("paused writes: the worker does not claim fit jobs, and a job that starts anyway goes back unspent", async () => {
    const held = await account("e1-held@example.test");
    const job = await queueFit(held, tenderIdOf(2));
    await setState("workspaces", true);

    const executed: string[] = [];
    const stop = startAiJobWorker({
      workerId: "e1-test-worker",
      executor: async (claimed) => void executed.push(claimed.id),
      // Title jobs queued by the collection never reach a model here.
      titleBatchExecutor: async (_provider, jobs) => jobs.map(() => undefined),
    });
    await sleep(400);
    assert.equal(executed.includes(job.id), false, "not claimed during the pause");
    assert.equal((await jobRow(job.id)).status, "queued");

    assert.equal(await runNow(job), true);
    assert.deepEqual(await jobRow(job.id), { status: "queued", attempts: 0, workspace_id: held.workspaceId, last_error: null });

    await setState("workspaces", false);
    await owner.query("update ai_jobs set run_after = now() where id = $1", [job.id]);
    for (let attempt = 0; attempt < 60 && !executed.includes(job.id); attempt += 1) await sleep(50);
    stop();
    assert.ok(executed.includes(job.id), "claimed again once writes resume");
    await sleep(100);
  });

  await t.test("API and worker as separate processes read the same state without a restart", async () => {
    /** A process of its own, with the role in its environment, asking whether a cycle may start. */
    const read = async (role: "api" | "worker") => {
      const probe = `(async () => {
        const { startCutoverCycle } = await import(${JSON.stringify(path.join(here, "cutover-cycle.ts"))});
        const { pool } = await import("@workspace/db");
        console.log(JSON.stringify(await startCutoverCycle("probe")));
        await pool.end();
      })();`;
      const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", "-e", probe], {
        cwd: path.resolve(here, "../.."),
        env: { ...process.env, APP_ROLE: role, LOG_LEVEL: "silent" },
      });
      return JSON.parse(stdout.trim().split("\n").at(-1)!);
    };
    const both = () => Promise.all([read("api"), read("worker")]);
    await setState("legacy", false);
    assert.deepEqual(await both(), [{ mode: "legacy" }, { mode: "legacy" }]);
    await setState("workspaces", true);
    assert.deepEqual(await both(), [null, null], "neither starts a cycle during the pause");
    await setState("workspaces", false);
    assert.deepEqual(await both(), [{ mode: "workspaces" }, { mode: "workspaces" }]);
  });

  const feed = async (cookie: string) => (await json(request("/v1/me/notifications?pageSize=50", {}, cookie))).data as any[];
  const stored = (userId: string) => all("select type, tender_id, workspace_id from notifications where user_id = $1 order by created_at, type", [userId]);
  const monitor = async (who: { cookie: string }, tenderId: string) =>
    assert.equal((await send("PUT", `/v1/me/saved-tenders/${tenderId}`, who.cookie, { monitored: true })).status, 200);
  const reschedule = (sequence: number, day: string, version: string) =>
    upsertPublications([publication(sequence, { dataEncerramentoProposta: `2099-11-${day}T17:00:00`, dataAtualizacao: version })], new Date());

  await t.test("collection: a tender change notifies with the workspace in workspaces and without one in legacy; both show in the feed", async () => {
    const workspaces = await account("e1-collect-workspaces@example.test");
    await monitor(workspaces, tenderIdOf(3));
    await setState("legacy", false);
    const legacy = await account("e1-collect-legacy@example.test");
    await monitor(legacy, tenderIdOf(4));
    await reschedule(4, "04", "2026-09-24T10:00:00");
    assert.deepEqual(await stored(legacy.userId), [{ type: "tender_deadline_changed", tender_id: tenderIdOf(4), workspace_id: null }]);

    await cutToWorkspaces([legacy.userId]);
    await reschedule(3, "03", "2026-09-24T10:00:00");
    assert.deepEqual(await stored(workspaces.userId), [{ type: "tender_deadline_changed", tender_id: tenderIdOf(3), workspace_id: workspaces.workspaceId }]);
    await db.transaction((tx) =>
      createDocumentAddedNotifications(tx, {
        tender: { id: tenderIdOf(3), title: "Aquisição de computadores TEST DATA", tenderNumberShort: null, organizationName: "Órgão de teste", proposalDeadline: null },
        previousCount: 1,
        nextCount: 2,
        addedDocumentIds: ["doc-2"],
        detectedAt: new Date(),
      }),
    );
    assert.deepEqual(
      (await stored(workspaces.userId)).map((row) => [row.type, row.workspace_id]),
      [["tender_deadline_changed", workspaces.workspaceId], ["tender_document_added", workspaces.workspaceId]],
    );
    assert.deepEqual((await feed(workspaces.cookie)).map((item) => item.type).sort(), ["tender_deadline_changed", "tender_document_added"]);
    assert.deepEqual((await feed(legacy.cookie)).map((item) => item.type), ["tender_deadline_changed"], "the one born in legacy, assigned by the delta");

    // Paused: a change nobody monitors is still collected; one that must notify waits for the next collection.
    await setState("workspaces", true);
    assert.equal(await reschedule(9, "09", "2026-09-24T10:00:00"), 1, "the catalog is not paused");
    await assert.rejects(reschedule(3, "13", "2026-09-25T10:00:00"), CutoverPausedError);
    assert.equal((await one("select proposal_deadline from tenders where id = $1", [tenderIdOf(3)])).proposal_deadline.toISOString().slice(0, 10), "2099-11-03", "the tender's transaction rolled back");
    assert.equal((await stored(workspaces.userId)).length, 2);
    await setState("workspaces", false);
    await reschedule(3, "13", "2026-09-25T10:00:00");
    assert.equal((await stored(workspaces.userId)).filter((row) => row.type === "tender_deadline_changed").length, 2, "notified once, after the pause");
  });

  await t.test("profile alerts: the notification and the cursor follow the model of the flag, and the alert shows in the feed", async () => {
    const cursor = async (who: { userId: string; workspaceId: string }) => ({
      legacy: (await one("select last_alert_at from company_profiles where user_id = $1", [who.userId]))?.last_alert_at ?? null,
      workspace: (await one("select last_alert_at from workspace_profiles where workspace_id = $1", [who.workspaceId]))?.last_alert_at ?? null,
    });
    await setState("legacy", false);
    const legacy = await account("e1-alert-legacy@example.test");
    await owner.query("update users set profile_alerts = false where id <> $1", [legacy.userId]);
    await sleep(5);
    await owner.query("update tenders set created_at = $1 where id = $2", [new Date(), tenderIdOf(7)]);
    await sleep(5);
    const firstRun = new Date();
    assert.equal(await evaluateProfileAlertNotifications(firstRun), 1);
    assert.deepEqual(await stored(legacy.userId), [{ type: "profile_new_matches", tender_id: null, workspace_id: null }]);
    assert.deepEqual((await cursor(legacy)).legacy, firstRun);
    assert.deepEqual((await feed(legacy.cookie)).map((item) => [item.type, item.matchCount]), [["profile_new_matches", 1]]);

    await setState("workspaces", false);
    const workspaces = await account("e1-alert-workspaces@example.test");
    await owner.query("update users set profile_alerts = (id = $1)", [workspaces.userId]);
    await sleep(5);
    await owner.query("update tenders set created_at = $1 where id = $2", [new Date(), tenderIdOf(8)]);
    await sleep(5);

    await setState("workspaces", true);
    assert.equal(await evaluateProfileAlertNotifications(new Date()), 0, "the cycle does not start during the pause");
    assert.deepEqual(await stored(workspaces.userId), []);
    await setState("workspaces", false);

    const secondRun = new Date();
    assert.equal(await evaluateProfileAlertNotifications(secondRun), 1);
    assert.deepEqual(await stored(workspaces.userId), [{ type: "profile_new_matches", tender_id: null, workspace_id: workspaces.workspaceId }]);
    assert.deepEqual(await cursor(workspaces), { legacy: null, workspace: secondRun }, "the cursor advances in the workspace profile only");
    assert.equal(
      (await one("select dedupe_key from notifications where user_id = $1", [workspaces.userId])).dedupe_key.startsWith(`profile:${workspaces.userId}:`),
      true,
      "legacy dedupe key until W4",
    );
    assert.deepEqual((await feed(workspaces.cookie)).map((item) => [item.type, item.matchCount]), [["profile_new_matches", 1]]);
    assert.equal(await evaluateProfileAlertNotifications(new Date()), 0, "nothing new: no second alert");
  });
});
