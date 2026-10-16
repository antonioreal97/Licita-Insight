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
const SCOPED = ["notifications", "email_deliveries", "email_delivery_notifications", "saved_tenders", "saved_searches"] as const;

// Opt-in: creates and drops its own database next to PNCP_TEST_DATABASE_URL, so the cutover flag is its own.
test("e-mail jobs, retention and the drain query under the cutover flag", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  const databaseName = `licita_ws_e2_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
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
  process.env.SESSION_SECRET = "workspace-e2-integration-secret-at-least-32-characters";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  for (const name of ["RATE_LIMIT_AUTH_PER_MINUTE", "RATE_LIMIT_USER_PER_MINUTE", "RATE_LIMIT_WRITE_PER_MINUTE"]) {
    process.env[name] = "10000";
  }
  for (const name of ["BILLING_MONTHLY_BRL", "BILLING_DEV_ENTITLED", "RESEND_API_KEY", "BREVO_API_KEY", "JEV_API_KEY", "OPENAI_API_KEY"]) {
    delete process.env[name];
  }

  const { pool } = await import("@workspace/db");
  const { default: app } = await import("../app");
  const { upsertPublications } = await import("../ingest/upsert-tenders");
  const { retryEmailDeliveries, runDailyEmailDigest, runImmediateEmailAlerts } = await import("../email/email-service");
  const { createTrialEndingNotifications, evaluateSavedSearchNotifications } = await import("../account/notification-service");
  const { evaluateProfileAlertNotifications } = await import("../ai/company-fit-service");
  const { loadEmailTenderHighlights } = await import("../ai/tender-highlights");
  const { runDailyRecommendations } = await import("../recommendations/recommendation-service");
  const { purgeRetainedPersonalData } = await import("../account/personal-data-retention");
  const { tryRunSingletonJob } = await import("../jobs/job-lock");
  const { cutoverDrainStatus } = await import("./cutover-drain");
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
  const one = async (text: string, values: unknown[] = []) => (await owner.query(text, values)).rows[0];
  const all = async (text: string, values: unknown[] = []) => (await owner.query(text, values)).rows;
  const setState = (mode: "legacy" | "workspaces", writesPaused: boolean) =>
    owner.query(
      "insert into workspace_cutover_events (mode, writes_paused, actor, reason) values ($1, $2, 'teste', 'TEST')",
      [mode, writesPaused],
    );
  /** A subscribed account that, like every account by the cutover, has a default workspace. */
  const account = async (email: string) => {
    const response = await request("/v1/auth/dev-login", { method: "POST", headers: csrf, body: JSON.stringify({ email, name: "TEST USER" }) });
    assert.equal(response.status, 204);
    const cookie = response.headers.get("set-cookie")!.split(";", 1)[0]!;
    const userId = ((await (await request("/v1/auth/session", {}, cookie)).json()) as any).user.id as string;
    await owner.query("insert into subscriptions (user_id, status, current_period_end) values ($1, 'active', '2099-01-01T00:00:00Z')", [userId]);
    await owner.query("update users set email_immediate_critical = true where id = $1", [userId]);
    if (!(await one("select 1 as found from workspaces where owner_user_id = $1", [userId]))) {
      await withCutoverGate({ kind: "http" }, (tx) =>
        createWorkspace(tx, { ownerUserId: userId, type: "procurement", name: "Compras públicas", isDefault: true }),
      );
    }
    return { cookie, userId, email, workspaceId: defaultWorkspaceId(userId) };
  };
  /** What the W3 delta does to these tables inside the cutover transaction, then the mode switch. */
  const cutToWorkspaces = async () => {
    const cutter = await owner.connect();
    try {
      await cutter.query("begin");
      await cutter.query("set local lock_timeout = '5s'");
      await cutter.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [LOCK_KEY]);
      for (const table of ["notifications", "email_deliveries", "saved_tenders", "saved_searches"]) {
        await cutter.query(
          `update ${table} t set workspace_id = w.id from workspaces w
           where w.owner_user_id = t.user_id and w.is_default and t.workspace_id is null`,
        );
      }
      await cutter.query(
        `update email_delivery_notifications l set workspace_id = d.workspace_id
         from email_deliveries d where d.id = l.delivery_id and l.workspace_id is null`,
      );
      await cutter.query(
        "insert into workspace_cutover_events (mode, writes_paused, actor, reason) values ('workspaces', false, 'teste', 'cut: TEST')",
      );
      await cutter.query("commit");
    } finally {
      cutter.release();
    }
  };

  const tenderIdOf = (sequence: number) => `00394460000141-1-${String(sequence).padStart(6, "0")}-2026`;
  await upsertPublications(
    [1, 2].map((sequence) => ({
      numeroControlePNCP: `00394460000141-1-${String(sequence).padStart(6, "0")}/2026`,
      objetoCompra: `Aquisição de computadores para TEST DATA ${sequence}`,
      numeroCompra: String(sequence),
      anoCompra: 2026,
      modalidadeId: 6,
      modalidadeNome: "Pregão - Eletrônico",
      situacaoCompraNome: "Divulgada no PNCP",
      dataPublicacaoPncp: "2026-09-20T09:00:00",
      dataEncerramentoProposta: "2099-10-30T17:00:00",
      dataAtualizacao: "2026-09-23T10:00:00",
      valorTotalEstimado: 100,
      orcamentoSigilosoCodigo: 1,
      orgaoEntidade: { cnpj: "00394460000141", razaoSocial: "Órgão de teste" },
      unidadeOrgao: { ufSigla: "DF", municipioNome: "Brasília" },
    })),
    new Date(),
  );

  /** A deadline-change notification as the collection writes it, `minutesAgo` old, with or without a workspace. */
  const notify = async (who: { userId: string }, options: { minutesAgo?: number; workspaceId?: string | null; tender?: number } = {}) => {
    const id = randomUUID();
    await owner.query(
      `insert into notifications (id, user_id, workspace_id, type, dedupe_key, created_at, tender_id, tender_title, change)
       values ($1, $2, $3, 'tender_deadline_changed', $4, now() - ($5::int * interval '1 minute'), $6, 'Aquisição de computadores TEST DATA',
         '{"field":"proposalDeadline","from":"2099-10-30T20:00:00.000Z","to":"2099-11-05T20:00:00.000Z"}')`,
      [id, who.userId, options.workspaceId ?? null, `tender:test:${id}`, options.minutesAgo ?? 30, tenderIdOf(options.tender ?? 1)],
    );
    return id;
  };
  const monitor = async (who: { cookie: string }, tender = 1) => {
    const response = await request(`/v1/me/saved-tenders/${tenderIdOf(tender)}`, { method: "PUT", headers: csrf, body: JSON.stringify({ monitored: true }) }, who.cookie);
    assert.equal(response.status, 200);
  };
  /** The existing fake transport: records what would be sent and answers as the provider would. */
  const sent: Array<{ to: string; key: string; html: string; text: string }> = [];
  let duringSend: (() => Promise<void>) | undefined;
  const sendEmail = async (message: { to: string; html: string; text: string }, key: string) => {
    sent.push({ to: message.to, key, html: message.html, text: message.text });
    const hook = duringSend;
    duringSend = undefined;
    await hook?.();
    return { status: "sent" as const, providerMessageId: `test-${sent.length}` };
  };
  const sentTo = (who: { email: string }) => sent.filter(({ to }) => to === who.email);
  const deliveries = (who: { userId: string }) =>
    all(
      `select d.mode, d.status, d.attempts, d.workspace_id, d.dedupe_key,
         (select count(*)::int from email_delivery_notifications l where l.delivery_id = d.id) as links,
         (select count(*)::int from email_delivery_notifications l where l.delivery_id = d.id and l.workspace_id is distinct from d.workspace_id) as mismatched
       from email_deliveries d where d.user_id = $1 order by d.created_at, d.mode`,
      [who.userId],
    );
  const counts = async () =>
    Object.fromEntries(
      await Promise.all(SCOPED.map(async (table) => [table, (await one(`select count(*)::int as count from ${table}`)).count] as const)),
    );
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  const legacy = await account("e2-legacy@example.test");
  const crossing = await account("e2-crossing@example.test");
  const waiting = await account("e2-waiting@example.test");

  await t.test("legacy: the digest sends one e-mail per account and writes no workspace", async () => {
    await notify(legacy, { minutesAgo: 90 });
    assert.deepEqual(await runDailyEmailDigest(new Date(), sendEmail), { queued: 1, sent: 1, failed: 0, skipped: 0 });
    assert.deepEqual(sentTo(legacy).map(({ key }) => key), [`email:digest:${legacy.userId}:${today()}`]);
    assert.deepEqual(await deliveries(legacy), [
      { mode: "digest", status: "sent", attempts: 1, workspace_id: null, dedupe_key: `email:digest:${legacy.userId}:${today()}`, links: 1, mismatched: 0 },
    ]);
  });

  await t.test("a digest that crosses the cutover records the e-mail it sent and stops; nothing is sent twice or left out", async () => {
    await notify(crossing, { minutesAgo: 60 });
    await notify(waiting, { minutesAgo: 30 });
    // The cutover commits while the first e-mail of the cycle is with the provider.
    duringSend = cutToWorkspaces;
    const before = sent.length;
    assert.deepEqual(await runDailyEmailDigest(new Date(), sendEmail), { queued: 1, sent: 1, failed: 0, skipped: 0 });
    assert.equal(sent.length, before + 1);
    assert.equal(sentTo(crossing).length, 1);
    const [delivery] = await deliveries(crossing);
    assert.deepEqual(
      [delivery.status, delivery.attempts, delivery.workspace_id, delivery.mismatched],
      ["sent", 1, crossing.workspaceId, 0],
      "recorded as sent in the new model, with the workspace the delta assigned",
    );
    assert.deepEqual(await deliveries(waiting), [], "the cycle stopped before the next recipient");

    assert.deepEqual(await retryEmailDeliveries(new Date(Date.now() + 5 * 60_000), sendEmail), { queued: 0, sent: 0, failed: 0, skipped: 0 });
    assert.deepEqual(await runDailyEmailDigest(new Date(), sendEmail), { queued: 1, sent: 1, failed: 0, skipped: 0 });
    assert.equal(sentTo(crossing).length, 1, "not sent again");
    assert.equal(sentTo(waiting).length, 1, "sent by the next cycle, once");
    assert.deepEqual(await deliveries(waiting), [
      { mode: "digest", status: "sent", attempts: 1, workspace_id: waiting.workspaceId, dedupe_key: `email:digest:${waiting.userId}:${today()}`, links: 1, mismatched: 0 },
    ]);
  });

  await t.test("the same notification is not e-mailed again after the cutover, and the day's digest key is the legacy one", async () => {
    await notify(legacy, { minutesAgo: 10, workspaceId: legacy.workspaceId });
    assert.deepEqual(await runDailyEmailDigest(new Date(), sendEmail), { queued: 0, sent: 0, failed: 0, skipped: 0 });
    assert.equal(sentTo(legacy).length, 1, "one digest a day, whichever mode sent it");
  });

  await t.test("workspaces: one e-mail per recipient and workspace; a row still without a workspace joins it", async () => {
    const both = await account("e2-workspaces@example.test");
    await notify(both, { minutesAgo: 40, workspaceId: both.workspaceId });
    await notify(both, { minutesAgo: 20, workspaceId: null });
    const deadlineOnly = await account("e2-deadline@example.test");
    const tomorrow = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const saved = await request(
      `/v1/me/saved-tenders/${tenderIdOf(2)}`,
      { method: "PUT", headers: csrf, body: JSON.stringify({ stage: "participating", nextAction: "Enviar proposta", nextActionDeadline: tomorrow }) },
      deadlineOnly.cookie,
    );
    assert.equal(saved.status, 200);

    assert.deepEqual(await runDailyEmailDigest(new Date(), sendEmail), { queued: 2, sent: 2, failed: 0, skipped: 0 });
    assert.deepEqual(await deliveries(both), [
      { mode: "digest", status: "sent", attempts: 1, workspace_id: both.workspaceId, dedupe_key: `email:digest:${both.userId}:${today()}`, links: 2, mismatched: 0 },
    ]);
    assert.deepEqual(await deliveries(deadlineOnly), [
      { mode: "digest", status: "sent", attempts: 1, workspace_id: deadlineOnly.workspaceId, dedupe_key: `email:digest:${deadlineOnly.userId}:${today()}`, links: 0, mismatched: 0 },
    ]);
    assert.equal(sentTo(both).length, 1);
  });

  await t.test("workspaces: saved-search matches consolidate by search and keep the workspace through the e-mail link", async () => {
    const who = await account("e2-saved-search@example.test");
    const searchId = randomUUID();
    const now = new Date();
    const firstAt = new Date(now.getTime() - 20 * 60_000);
    const firstRun = new Date(now.getTime() - 15 * 60_000);
    const secondAt = new Date(now.getTime() - 10 * 60_000);
    const secondRun = new Date(now.getTime() - 5 * 60_000);
    await owner.query(
      `insert into saved_searches (id, user_id, workspace_id, name, query, alerts_enabled, last_checked_at)
       values ($1, $2, $3, 'Computadores', 'q=computadores', true, $4)`,
      [searchId, who.userId, who.workspaceId, new Date(now.getTime() - 30 * 60_000)],
    );
    await owner.query("update tenders set created_at = $1 where id = $2", [firstAt, tenderIdOf(1)]);
    await owner.query("update tenders set created_at = $1 where id = $2", [new Date(now.getTime() + 60_000), tenderIdOf(2)]);
    await evaluateSavedSearchNotifications(firstRun);
    await owner.query("update tenders set created_at = $1 where id = $2", [secondAt, tenderIdOf(2)]);
    await evaluateSavedSearchNotifications(secondRun);

    const consolidated = await all(
      `select id, workspace_id, saved_search_id, match_count, tender_ids
       from notifications where user_id = $1 and saved_search_id = $2 order by created_at`,
      [who.userId, searchId],
    );
    assert.deepEqual(consolidated, [
      {
        id: consolidated[0]?.id,
        workspace_id: who.workspaceId,
        saved_search_id: searchId,
        match_count: 2,
        tender_ids: [tenderIdOf(1), tenderIdOf(2)],
      },
    ]);

    assert.deepEqual(await runDailyEmailDigest(now, sendEmail), { queued: 1, sent: 1, failed: 0, skipped: 0 });
    assert.deepEqual(
      await one(
        `select d.workspace_id as delivery_workspace, l.workspace_id as link_workspace
         from email_delivery_notifications l join email_deliveries d on d.id = l.delivery_id
         where l.notification_id = $1`,
        [consolidated[0].id],
      ),
      { delivery_workspace: who.workspaceId, link_workspace: who.workspaceId },
    );

    await owner.query("update tenders set created_at = $1 where id = $2", [new Date(now.getTime() - 60_000), tenderIdOf(1)]);
    await evaluateSavedSearchNotifications(now);
    const afterDelivery = await all(
      `select workspace_id, saved_search_id, match_count
       from notifications where user_id = $1 and saved_search_id = $2 order by created_at`,
      [who.userId, searchId],
    );
    assert.deepEqual(afterDelivery, [
      { workspace_id: who.workspaceId, saved_search_id: searchId, match_count: 2 },
      { workspace_id: who.workspaceId, saved_search_id: searchId, match_count: 1 },
    ]);
  });

  await t.test("workspaces: personalized tender highlights read the notification workspace profile and fits", async () => {
    const who = await account("e2-highlights@example.test");
    const profile = {
      description: "Fornecemos equipamentos de informática e suporte técnico corporativo.",
      offerings: ["computadores"],
      exclusions: [],
      selectedCategories: [],
      selectedKeywords: [],
      excludedKeywords: [],
      registeredPlatforms: ["bll"],
      coverage: { scope: "national", mode: "strict", acceptsRemote: false },
      valueRange: { min: null, max: null },
      size: "other",
    };
    assert.equal(
      (await request("/v1/me/company-profile", { method: "PUT", headers: csrf, body: JSON.stringify(profile) }, who.cookie)).status,
      200,
    );
    await owner.query(
      "update tenders set platform='comprasgov', platform_label='Compras.gov.br' where id=$1",
      [tenderIdOf(1)],
    );
    await owner.query(
      `insert into company_tender_fits
       (id, user_id, workspace_id, tender_id, profile_version, tender_fingerprint, requested_model, prompt_version,
        status, level, score, reasons, checked_at)
       values ($1, $2, $3, $4, 1, 'test', 'test-model', 1, 'ready', 'high', 0.9,
        '[{"kind":"offering_match","terms":["computadores"]}]', now())`,
      [randomUUID(), who.userId, who.workspaceId, tenderIdOf(1)],
    );
    const highlights = await loadEmailTenderHighlights(
      who.userId,
      [tenderIdOf(1)],
      undefined,
      { mode: "workspaces", workspaceId: who.workspaceId },
    );
    assert.deepEqual(highlights.get(tenderIdOf(1))?.lines, [
      "Alta aderência ao seu perfil: combina com “computadores”",
      "Disputa em Compras.gov.br: você ainda não é cadastrado nesta plataforma",
    ]);

    const notificationId = randomUUID();
    await owner.query(
      `insert into notifications
       (id, user_id, workspace_id, type, dedupe_key, created_at, saved_search_id, saved_search_name,
        saved_search_query, match_count, tender_ids)
       values ($1, $2, $3, 'saved_search_new_matches', $4, now() - interval '1 second', 'highlight-search', 'Computadores',
        'q=computadores', 1, $5)`,
      [
        notificationId,
        who.userId,
        who.workspaceId,
        `saved-search:highlight-search:${today()}`,
        JSON.stringify([tenderIdOf(1)]),
      ],
    );
    assert.deepEqual(await runDailyEmailDigest(new Date(), sendEmail), { queued: 1, sent: 1, failed: 0, skipped: 0 });
    const [email] = sentTo(who);
    assert.match(email!.html, /Alta aderência ao seu perfil: combina com “computadores”/);
    assert.match(email!.text, /você ainda não é cadastrado nesta plataforma/);
  });

  await t.test("workspaces: the immediate alert of a monitored tender goes out once, with the workspace", async () => {
    const urgent = await account("e2-immediate@example.test");
    await monitor(urgent);
    const notificationId = await notify(urgent, { minutesAgo: 15, workspaceId: urgent.workspaceId });
    assert.deepEqual(await runImmediateEmailAlerts(new Date(), { sendEmail }), { queued: 1, sent: 1, failed: 0, skipped: 0 });
    assert.deepEqual(await runImmediateEmailAlerts(new Date(), { sendEmail }), { queued: 0, sent: 0, failed: 0, skipped: 0 });
    const [delivery] = await deliveries(urgent);
    assert.deepEqual([delivery.mode, delivery.status, delivery.workspace_id, delivery.links, delivery.mismatched], ["immediate", "sent", urgent.workspaceId, 1, 0]);
    assert.match(delivery.dedupe_key, new RegExp(`^email:immediate:${urgent.userId}:[0-9a-f]{24}$`), "legacy key text until W4");
    assert.deepEqual(
      await one("select workspace_id from email_delivery_notifications where notification_id = $1", [notificationId]),
      { workspace_id: urgent.workspaceId },
    );
  });

  await t.test("retention deletes and redacts the same rows in both modes", async () => {
    const purge = async (mode: "legacy" | "workspaces") => {
      await setState(mode, false);
      const who = await account(`e2-retention-${mode}@example.test`);
      const workspaceId = mode === "workspaces" ? who.workspaceId : null;
      const read = await notify(who, { workspaceId });
      const unread = await notify(who, { workspaceId });
      await owner.query("update notifications set read_at = now() - interval '200 days', created_at = now() - interval '201 days' where id = $1", [read]);
      await owner.query("update notifications set created_at = now() - interval '201 days' where id = $1", [unread]);
      await owner.query(
        `insert into email_deliveries (id, user_id, workspace_id, mode, dedupe_key, recipient_email, subject, html_body, text_body, status, created_at)
         values ($1, $2, $3, 'digest', $4, $5, 'Assunto', '<p>corpo</p>', 'corpo', 'sent', now() - interval '200 days')`,
        [randomUUID(), who.userId, workspaceId, `test:retention:${mode}`, who.email],
      );
      const result = await purgeRetainedPersonalData();
      const left = await all("select id from notifications where user_id = $1", [who.userId]);
      const delivery = await one("select recipient_email, html_body, text_body, subject from email_deliveries where user_id = $1", [who.userId]);
      return { result, unreadKept: left.length === 1 && left[0].id === unread, delivery };
    };
    const inLegacy = await purge("legacy");
    const inWorkspaces = await purge("workspaces");
    assert.deepEqual(inLegacy.result, { sessionsDeleted: 0, notificationsDeleted: 1, emailDeliveriesRedacted: 1 });
    assert.deepEqual(inWorkspaces, inLegacy);
    assert.deepEqual(inLegacy.delivery, { recipient_email: "expurgado@pardaldigital.invalid", html_body: "", text_body: "", subject: "Assunto" });
    assert.equal(inLegacy.unreadKept, true);
  });

  await t.test("the drain query sees what is running in the scope, and only that", async () => {
    assert.deepEqual(await cutoverDrainStatus(owner), { drained: true, running: [], stale: [] });

    let during = await cutoverDrainStatus(owner);
    await tryRunSingletonJob("saved_search_evaluation", async () => void (during = await cutoverDrainStatus(owner)));
    assert.deepEqual(during, { drained: false, running: [{ routine: "job:saved_search_evaluation", running: 1 }], stale: [] });

    await tryRunSingletonJob(`pncp_detail:${tenderIdOf(1)}`, async () => void (during = await cutoverDrainStatus(owner)));
    assert.deepEqual(during.running, [{ routine: `job:pncp_detail:${tenderIdOf(1)}`, running: 1 }], "one key per tender, matched by prefix");

    await tryRunSingletonJob("category_classify", async () => void (during = await cutoverDrainStatus(owner)));
    assert.equal(during.drained, true, "a routine outside the scope does not hold the cutover");

    const fit = randomUUID();
    await owner.query(
      "insert into ai_jobs (id, kind, dedupe_key, tender_id, payload, lane, status) values ($1, 'fit', $2, $3, '{}', 'batch', 'running')",
      [fit, `fit:test:${fit}`, tenderIdOf(1)],
    );
    assert.deepEqual(await cutoverDrainStatus(owner), { drained: false, running: [{ routine: "ai_jobs:fit", running: 1 }], stale: [] });
    await owner.query("update ai_jobs set status = 'succeeded' where id = $1", [fit]);

    // A process that died mid-cycle left its audit row `running`, but its lock went with the connection.
    await owner.query("insert into job_run_audit (job_key, status, worker_id) values ('email_digest', 'running', 'gone:1')");
    assert.deepEqual(await cutoverDrainStatus(owner), { drained: true, running: [], stale: [{ routine: "job:email_digest", stale: 1 }] });
    await owner.query("delete from job_run_audit where worker_id = 'gone:1'");
  });

  await t.test("with writes paused every scoped routine stays out and the drain query returns zero", async () => {
    for (const mode of ["workspaces", "legacy"] as const) {
      await setState(mode, false);
      const pending = await account(`e2-paused-${mode}@example.test`);
      await monitor(pending);
      await notify(pending, { minutesAgo: 15, workspaceId: mode === "workspaces" ? pending.workspaceId : null });
      await setState(mode, true);
      const before = await counts();
      const sentBefore = sent.length;

      const routines: Array<[string, () => Promise<unknown>]> = [
        ["trial_notifications", () => createTrialEndingNotifications()],
        ["saved_search_evaluation", () => evaluateSavedSearchNotifications()],
        ["profile_alert_evaluation", () => evaluateProfileAlertNotifications()],
        ["email_immediate", async () => [await runImmediateEmailAlerts(new Date(), { sendEmail }), await retryEmailDeliveries(new Date(), sendEmail)]],
        ["email_digest", () => runDailyEmailDigest(new Date(), sendEmail)],
        ["daily_recommendations", () => runDailyRecommendations()],
        ["personal_data_retention", () => purgeRetainedPersonalData()],
      ];
      for (const [key, routine] of routines) {
        const run = await tryRunSingletonJob(key, routine);
        assert.equal(run.acquired, true, key);
      }
      assert.deepEqual(await cutoverDrainStatus(owner), { drained: true, running: [], stale: [] });
      assert.deepEqual(await counts(), before, `${mode}: nothing written in the scope during the pause`);
      assert.equal(sent.length, sentBefore, `${mode}: no e-mail during the pause`);

      await setState(mode, false);
      assert.deepEqual(await runImmediateEmailAlerts(new Date(), { sendEmail }), { queued: 1, sent: 1, failed: 0, skipped: 0 }, "sent once writes resume");
      assert.equal(sentTo(pending).length, 1);
    }
  });
});
