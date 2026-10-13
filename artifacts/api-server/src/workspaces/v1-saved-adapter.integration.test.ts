import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { dropTestDatabase } from "./drop-test-database";

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../lib/db/migrations",
);
const LOCK_KEY = "licitai:workspace-cutover";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Timestamps, request ids and search timing differ between two runs by construction; everything else must match. */
const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      (/(At|^at)$/.test(key) && typeof entry === "string") || key === "requestId" || key === "tookMs"
        ? "<varies>"
        : normalize(entry),
    ]),
  );
};

// Opt-in: creates and drops its own database next to PNCP_TEST_DATABASE_URL, so the cutover flag is its own.
test("v1 saved tenders and participation in legacy and workspaces modes", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  const databaseName = `licita_ws_d2_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
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
  process.env.SESSION_SECRET = "workspace-d2-integration-secret-at-least-32-characters";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  for (const name of ["RATE_LIMIT_AUTH_PER_MINUTE", "RATE_LIMIT_USER_PER_MINUTE", "RATE_LIMIT_WRITE_PER_MINUTE"]) {
    process.env[name] = "10000";
  }
  for (const name of ["BILLING_MONTHLY_BRL", "BILLING_DEV_ENTITLED", "RESEND_API_KEY", "JEV_API_KEY", "OPENAI_API_KEY"]) {
    delete process.env[name];
  }

  const { pool } = await import("@workspace/db");
  const { default: app } = await import("../app");
  const { upsertPublications } = await import("../ingest/upsert-tenders");
  const { withCutoverGate } = await import("./cutover-gate");
  const { createWorkspace, defaultWorkspaceId } = await import("./workspace-service");

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await pool.end();
    await owner.end();
    await dropTestDatabase(admin, databaseName);
    await admin.end();
  });

  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
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
  const login = async (email: string, subscribed = true): Promise<{ cookie: string; userId: string }> => {
    const response = await request("/v1/auth/dev-login", {
      method: "POST",
      headers: csrf,
      body: JSON.stringify({ email, name: "TEST USER" }),
    });
    assert.equal(response.status, 204);
    const cookie = response.headers.get("set-cookie")!.split(";", 1)[0]!;
    const session = await request("/v1/auth/session", {}, cookie);
    const userId = ((await session.json()) as { user: { id: string } }).user.id;
    await owner.query(
      subscribed
        ? "insert into subscriptions (user_id, status, current_period_end) values ($1, 'active', '2099-01-01T00:00:00Z')"
        : "update users set trial_ends_at = '2000-01-01T00:00:00Z' where id = $1",
      [userId],
    );
    return { cookie, userId };
  };
  /**
   * The default workspace the W3 backfill gives an account created in legacy; created here the same way. An account
   * created in workspaces mode is already born with it.
   */
  const createDefaultWorkspace = async (userId: string) => {
    const existing = await owner.query("select 1 from workspaces where owner_user_id = $1 and is_default", [userId]);
    if (existing.rowCount) return;
    await withCutoverGate({ kind: "http" }, (tx) =>
      createWorkspace(tx, { ownerUserId: userId, type: "procurement", name: "Licitações", isDefault: true }),
    );
  };
  const setState = (mode: "legacy" | "workspaces", writesPaused: boolean) =>
    owner.query(
      "insert into workspace_cutover_events (mode, writes_paused, actor, reason) values ($1, $2, 'teste', 'TEST')",
      [mode, writesPaused],
    );
  /** What the W3 delta does to `saved_tenders` inside the cutover transaction, then the mode switch. */
  const cutToWorkspaces = async (userId: string, holdMs = 0): Promise<number> => {
    const cutter = await owner.connect();
    try {
      await cutter.query("begin");
      await cutter.query("set local lock_timeout = '5s'");
      await cutter.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [LOCK_KEY]);
      const assigned = await cutter.query(
        "update saved_tenders set workspace_id = $1 where user_id = $2 and workspace_id is null",
        [defaultWorkspaceId(userId), userId],
      );
      await cutter.query(
        "insert into workspace_cutover_events (mode, writes_paused, actor, reason) values ('workspaces', false, 'teste', 'cut: TEST')",
      );
      await sleep(holdMs);
      await cutter.query("commit");
      return assigned.rowCount ?? 0;
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
    dataPublicacaoPncp: `2026-0${7 + Math.floor((sequence - 1) / 28)}-${String(((sequence - 1) % 28) + 1).padStart(2, "0")}T09:00:00`,
    dataEncerramentoProposta: `2099-1${Math.floor((sequence - 1) / 28)}-${String(((sequence - 1) % 28) + 1).padStart(2, "0")}T17:00:00`,
    dataAtualizacao: "2026-09-23T10:00:00",
    valorTotalEstimado: 100,
    orcamentoSigilosoCodigo: 1,
    orgaoEntidade: { cnpj: "00394460000141", razaoSocial: "Órgão de teste" },
    unidadeOrgao: { ufSigla: "DF", municipioNome: "Brasília" },
    ...overrides,
  });
  await upsertPublications(
    Array.from({ length: 34 }, (_, index) => publication(index + 1)),
    new Date(),
  );
  const [first, second, third, fourth] = [1, 2, 3, 4].map(tenderIdOf) as [string, string, string, string];
  const wave = Array.from({ length: 30 }, (_, index) => tenderIdOf(index + 5));

  const save = (cookie: string, tenderId: string, body: unknown = {}) =>
    request(`/v1/me/saved-tenders/${tenderId}`, { method: "PUT", headers: csrf, body: JSON.stringify(body) }, cookie);
  const remove = (cookie: string, tenderId: string) =>
    request(`/v1/me/saved-tenders/${tenderId}`, { method: "DELETE", headers: csrf }, cookie);
  const importIds = (cookie: string, ids: string[]) =>
    request("/v1/me/saved-tenders/import", { method: "POST", headers: csrf, body: JSON.stringify({ ids }) }, cookie);
  const json = async (response: Promise<Response>) => (await response).json();
  /** `/ids` has no ORDER BY, today or here: the two lists are sets, compared sorted. */
  const sortedIds = (body: { saved: string[]; monitored: string[] }) => ({
    saved: [...body.saved].sort(),
    monitored: [...body.monitored].sort(),
  });
  const ids = async (cookie: string) =>
    sortedIds((await json(request("/v1/me/saved-tenders/ids", {}, cookie))) as { saved: string[]; monitored: string[] });
  const storedRows = async (userId: string) =>
    (
      await owner.query(
        `select tender_id, workspace_id, monitored, monitored_at is not null as has_monitored_at, stage, protocol,
           next_action, next_action_deadline, checklist, jsonb_array_length(history) as transitions
         from saved_tenders where user_id = $1 order by tender_id`,
        [userId],
      )
    ).rows;

  /** The v1 contract of saved tenders, participation and the search flag that reads monitoring, as the UI calls it. */
  const contract = async (cookie: string, beforeRemove: () => Promise<void>) => {
    const answers: Array<[string, number, unknown]> = [];
    const record = async (label: string, response: Promise<Response>) => {
      const result = await response;
      const body = result.status === 204 ? null : normalize(await result.json());
      answers.push([label, result.status, label.startsWith("ids") ? sortedIds(body as { saved: string[]; monitored: string[] }) : body]);
    };
    await record("ids empty", request("/v1/me/saved-tenders/ids", {}, cookie));
    await record("list empty", request("/v1/me/saved-tenders", {}, cookie));
    await record("get not saved", request(`/v1/me/saved-tenders/${first}`, {}, cookie));
    await record("save", save(cookie, first));
    await record("save again keeps the row", save(cookie, first));
    await record("save unknown tender", save(cookie, "does-not-exist"));
    await record("save unknown field", save(cookie, first, { workspaceId: "ws_other" }));
    await record("monitor", save(cookie, first, { monitored: true }));
    await record(
      "participate",
      save(cookie, second, {
        stage: "participating",
        protocol: "PROTO-2026/1",
        nextAction: "Enviar proposta",
        nextActionDeadline: "2099-10-01T12:00:00.000Z",
        checklist: [
          { key: "regularidade_fiscal", state: "have", note: "CND válida" },
          { key: "samples", state: "unknown" },
        ],
      }),
    );
    await record("advance stage", save(cookie, second, { stage: "submitted" }));
    await record("merge checklist", save(cookie, second, { checklist: [{ key: "samples", state: "missing", note: "pedir" }] }));
    await record("clear next action", save(cookie, second, { nextAction: null }));
    await record("dismiss stops monitoring", save(cookie, first, { stage: "dismissed" }));
    await record("invalid stage", save(cookie, first, { stage: "fake" }));
    await record("import", importIds(cookie, [first, third, third, "does-not-exist"]));
    await record("get", request(`/v1/me/saved-tenders/${second}`, {}, cookie));
    await record("list", request("/v1/me/saved-tenders", {}, cookie));
    await record("list monitored", request("/v1/me/saved-tenders?monitored=true", {}, cookie));
    await record("list by stage and deadline", request("/v1/me/saved-tenders?stage=submitted&sort=deadline&upcoming=true", {}, cookie));
    await record("list second page", request("/v1/me/saved-tenders?page=2&pageSize=2", {}, cookie));
    await record("list invalid stage", request("/v1/me/saved-tenders?stage=fake", {}, cookie));
    await record("ids", request("/v1/me/saved-tenders/ids", {}, cookie));
    await record("search with includeMonitored", request("/v1/tenders/search?status=open&includeMonitored=true&facets=false&pageSize=5", {}, cookie));
    await record("search without includeMonitored", request("/v1/tenders/search?status=open&facets=false&pageSize=5", {}, cookie));
    await beforeRemove();
    await record("remove", remove(cookie, first));
    await record("remove again", remove(cookie, first));
    await record("get removed", request(`/v1/me/saved-tenders/${first}`, {}, cookie));
    await record("ids after remove", request("/v1/me/saved-tenders/ids", {}, cookie));
    return answers;
  };

  const denied = async (cookie: string) => {
    const read = await request("/v1/me/saved-tenders/ids", {}, cookie);
    const write = await save(cookie, first, { stage: "participating" });
    return [read.status, ((await read.json()) as any).error.code, write.status, (await importIds(cookie, [first])).status];
  };

  const legacyUser = await login("d2-legacy@example.test");
  const unsubscribed = await login("d2-unsubscribed@example.test", false);
  let legacyRows: unknown[] = [];
  const legacyAnswers = await contract(legacyUser.cookie, async () => {
    legacyRows = await storedRows(legacyUser.userId);
    assert.equal(legacyRows.length, 3);
    assert.ok(legacyRows.every((row: any) => row.workspace_id === null), "legacy writes today's rows");
  });
  const deniedInLegacy = await denied(unsubscribed.cookie);

  const workspacesUser = await login("d2-workspaces@example.test");
  const workspaceId = defaultWorkspaceId(workspacesUser.userId);
  await createDefaultWorkspace(workspacesUser.userId);
  await setState("workspaces", false);
  let workspacesRows: unknown[] = [];
  const workspacesAnswers = await contract(workspacesUser.cookie, async () => {
    workspacesRows = await storedRows(workspacesUser.userId);
    assert.equal(workspacesRows.length, 3);
    assert.ok(workspacesRows.every((row: any) => row.workspace_id === workspaceId), "every row carries the default workspace");
  });
  const deniedInWorkspaces = await denied(unsubscribed.cookie);

  await t.test("the v1 contract answers the same payloads in legacy and in workspaces", () => {
    assert.deepEqual(workspacesAnswers, legacyAnswers);
    assert.deepEqual(
      legacyAnswers.map(([label, status]) => `${label}: ${status}`),
      [
        "ids empty: 200",
        "list empty: 200",
        "get not saved: 404",
        "save: 200",
        "save again keeps the row: 200",
        "save unknown tender: 404",
        "save unknown field: 400",
        "monitor: 200",
        "participate: 200",
        "advance stage: 200",
        "merge checklist: 200",
        "clear next action: 200",
        "dismiss stops monitoring: 200",
        "invalid stage: 400",
        "import: 200",
        "get: 200",
        "list: 200",
        "list monitored: 200",
        "list by stage and deadline: 200",
        "list second page: 200",
        "list invalid stage: 400",
        "ids: 200",
        "search with includeMonitored: 200",
        "search without includeMonitored: 200",
        "remove: 204",
        "remove again: 204",
        "get removed: 404",
        "ids after remove: 200",
      ],
    );
    const byLabel = new Map(legacyAnswers.map(([label, , body]) => [label, body as Record<string, any>]));
    assert.deepEqual(byLabel.get("ids empty"), { saved: [], monitored: [] }, "another account's rows never leak in");
    assert.equal(byLabel.get("participate")!.monitored, true, "participating turns monitoring on");
    assert.equal(byLabel.get("dismiss stops monitoring")!.monitored, false);
    assert.deepEqual(byLabel.get("import"), { imported: 1, alreadySaved: 1, notFound: ["does-not-exist"], skippedByLimit: 0 });
    const participation = byLabel.get("get")!;
    assert.equal(participation.stage, "submitted");
    assert.equal(participation.protocol, "PROTO-2026/1");
    assert.equal(participation.nextAction, null);
    assert.equal(participation.nextActionDeadline, "2099-10-01T12:00:00.000Z");
    assert.deepEqual(
      participation.checklist.map((item: any) => [item.key, item.state, item.note]),
      [["regularidade_fiscal", "have", "CND válida"], ["samples", "missing", "pedir"]],
    );
    assert.deepEqual(participation.history.map((item: any) => [item.from, item.to]), [[null, "participating"], ["participating", "submitted"]]);
    assert.equal(byLabel.get("list")!.pagination.total, 3);
    assert.deepEqual(byLabel.get("list monitored")!.data.map((item: any) => item.tender.id), [second]);
    assert.deepEqual(byLabel.get("list by stage and deadline")!.data.map((item: any) => item.tender.id), [second]);
    assert.deepEqual(byLabel.get("ids"), { saved: [first, second, third], monitored: [second] });
    assert.equal(byLabel.get("search with includeMonitored")!.data.length, 5);
    assert.deepEqual(
      byLabel.get("search with includeMonitored"),
      byLabel.get("search without includeMonitored"),
      "the search does not read saved tenders today, in either mode",
    );
    assert.deepEqual(byLabel.get("ids after remove"), { saved: [second, third], monitored: [second] });
  });

  await t.test("stored rows hold the same fields in both modes, apart from workspace_id", () => {
    /** The checklist timestamps come from the clock of each save. */
    const comparable = (rows: unknown[]) =>
      rows.map((row: any) => ({
        ...row,
        workspace_id: null,
        checklist: row.checklist.map((item: any) => ({ ...item, updatedAt: "<varies>" })),
      }));
    assert.deepEqual(comparable(workspacesRows), comparable(legacyRows));
  });

  await t.test("the subscription gate answers 402 before the workspace is resolved", async () => {
    assert.deepEqual(deniedInLegacy, [402, "SUBSCRIPTION_REQUIRED", 402, 402]);
    assert.deepEqual(deniedInWorkspaces, deniedInLegacy);
    assert.deepEqual(await storedRows(unsubscribed.userId), []);
  });

  await t.test("a tender change still notifies whoever monitors it, whichever mode saved the row", async () => {
    await upsertPublications(
      [publication(2, { dataEncerramentoProposta: "2099-11-02T17:00:00", dataAtualizacao: "2026-09-24T10:00:00" })],
      new Date(),
    );
    await upsertPublications(
      [publication(3, { dataEncerramentoProposta: "2099-11-03T17:00:00", dataAtualizacao: "2026-09-24T10:00:00" })],
      new Date(),
    );
    const notified = await owner.query(
      "select user_id, tender_id, type from notifications where tender_id = any($1::text[]) order by user_id",
      [[second, third]],
    );
    assert.deepEqual(
      notified.rows,
      [legacyUser.userId, workspacesUser.userId]
        .sort()
        .map((userId) => ({ user_id: userId, tender_id: second, type: "tender_deadline_changed" })),
      "one per account monitoring the tender; a saved tender that is not monitored notifies nobody",
    );
  });

  const concurrent = await login("d2-concurrent@example.test");
  const concurrentWorkspace = defaultWorkspaceId(concurrent.userId);

  await t.test("cutover under concurrent saves: rows before the switch are assigned, rows after carry the workspace", async () => {
    await setState("legacy", false);
    await createDefaultWorkspace(concurrent.userId);
    const responses = wave.map((tenderId, index) =>
      sleep(index * 15).then(async () => {
        const response = await save(concurrent.cookie, tenderId, { monitored: true, nextAction: `Passo ${index}` });
        return { tenderId, status: response.status, body: (await response.json()) as any };
      }),
    );
    await sleep(120);
    const assigned = await cutToWorkspaces(concurrent.userId, 200);
    const results = await Promise.all(responses);

    assert.ok(results.every(({ status }) => status === 200 || status === 503), JSON.stringify(results.map(({ status }) => status)));
    const refused = results.filter(({ status }) => status === 503);
    assert.ok(refused.length > 0, "requests during the switch answer 503");
    assert.ok(refused.every(({ body }) => body.error.code === "MAINTENANCE_IN_PROGRESS"));
    const accepted = results.filter(({ status }) => status === 200).map(({ tenderId }) => tenderId).sort();

    const rows = await storedRows(concurrent.userId);
    assert.deepEqual(rows.map((row) => row.tender_id), accepted, "one row per accepted save, none for a refused one");
    assert.ok(assigned > 0, "some saves landed in legacy before the switch");
    assert.ok(assigned < accepted.length, "saves after the switch were written by the workspaces path");
    assert.ok(rows.every((row) => row.workspace_id === concurrentWorkspace), "no legacy row after the switch");
    assert.deepEqual(await ids(concurrent.cookie), { saved: accepted, monitored: accepted });
  });

  await t.test("paused writes: mutations answer 503 and write nothing; reads still answer 200", async () => {
    for (const mode of ["workspaces", "legacy"] as const) {
      await setState(mode, false);
      const before = await storedRows(concurrent.userId);
      await setState(mode, true);
      const refused = await save(concurrent.cookie, first, { stage: "participating" });
      assert.equal(refused.status, 503);
      assert.equal(refused.headers.get("retry-after"), "60");
      assert.equal(((await refused.json()) as any).error.code, "MAINTENANCE_IN_PROGRESS");
      assert.equal((await save(concurrent.cookie, wave[0]!, { nextAction: "Durante a pausa" })).status, 503);
      assert.equal((await remove(concurrent.cookie, wave[0]!)).status, 503);
      assert.equal((await importIds(concurrent.cookie, [first, second])).status, 503);
      assert.deepEqual(await storedRows(concurrent.userId), before);
      assert.equal((await request("/v1/me/saved-tenders", {}, concurrent.cookie)).status, 200);
      assert.equal((await request("/v1/me/saved-tenders/ids", {}, concurrent.cookie)).status, 200);
      assert.equal((await request(`/v1/me/saved-tenders/${before[0]!.tender_id}`, {}, concurrent.cookie)).status, 200);
      assert.equal((await request("/v1/tenders/search?status=open&includeMonitored=true&facets=false", {}, concurrent.cookie)).status, 200);
    }
    await setState("workspaces", false);
  });

  await t.test("rows written in workspaces stay readable and writable by legacy after the flag is turned off", async () => {
    const read = () =>
      Promise.all([
        ids(workspacesUser.cookie),
        json(request("/v1/me/saved-tenders?pageSize=100", {}, workspacesUser.cookie)),
        json(request(`/v1/me/saved-tenders/${second}`, {}, workspacesUser.cookie)),
      ]);
    const inWorkspaces = await read();
    assert.equal((inWorkspaces[1] as any).pagination.total, 2);

    // No reverse copy for saved_tenders: the legacy key (user_id, tender_id) is intact until W4.
    await setState("legacy", false);
    assert.deepEqual(await read(), inWorkspaces);

    const updated = (await json(save(workspacesUser.cookie, second, { nextAction: "Depois da desvirada" }))) as any;
    assert.equal(updated.nextAction, "Depois da desvirada");
    assert.equal(updated.protocol, "PROTO-2026/1");
    assert.equal(updated.history.length, 2);
    assert.equal((await save(workspacesUser.cookie, fourth, { monitored: true })).status, 200);
    assert.deepEqual(
      (await storedRows(workspacesUser.userId)).map((row) => [row.tender_id, row.workspace_id]),
      [[second, workspaceId], [third, workspaceId], [fourth, null]],
      "legacy keeps the workspace on rows it updates and writes new rows without one",
    );
    const inLegacy = await read();

    assert.equal(await cutToWorkspaces(workspacesUser.userId), 1, "the next cutover assigns the row saved in legacy");
    assert.deepEqual(await read(), inLegacy);
    assert.deepEqual((inLegacy[0] as any).saved, [second, third, fourth]);
  });
});
