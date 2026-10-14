import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { dropTestDatabase } from "./drop-test-database";

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../lib/db/migrations",
);
const LOCK_KEY = "licitai:workspace-cutover";
/** The sections the export had before workspaces; whoever reads the file today keeps finding all of them. */
const LEGACY_EXPORT_KEYS = [
  "exportedAt", "user", "sessions", "savedTenders", "savedSearches", "notifications", "emailDeliveries", "aiQuestions",
  "aiDailyUsage", "aiDailyTenders", "aiJobs", "companyProfile", "companyFits", "fitUsage", "recommendationEvents",
  "recommendationDismissals", "recommendationInterestProfile", "recommendations", "subscription", "couponRedemptions",
];
/** Sections whose rows belong to one workspace in the new model. */
const SCOPED_SECTIONS = [
  "savedTenders", "savedSearches", "notifications", "emailDeliveries", "aiJobs", "companyFits", "recommendationEvents",
  "recommendationDismissals", "recommendations",
];

// Opt-in: creates and drops its own database next to PNCP_TEST_DATABASE_URL, so the cutover flag is its own.
test("LGPD export, account deletion and isolation in legacy and workspaces modes", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  const databaseName = `licita_ws_f_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
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
  process.env.SESSION_SECRET = "workspace-f-integration-secret-at-least-32-characters";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.AI_FIT_LEXICAL_GATE = "off";
  for (const name of ["RATE_LIMIT_AUTH_PER_MINUTE", "RATE_LIMIT_USER_PER_MINUTE", "RATE_LIMIT_WRITE_PER_MINUTE", "RATE_LIMIT_AI_PER_MINUTE"]) {
    process.env[name] = "10000";
  }
  for (const name of ["BILLING_MONTHLY_BRL", "BILLING_DEV_ENTITLED", "RESEND_API_KEY", "BREVO_API_KEY", "JEV_API_KEY", "OPENAI_API_KEY", "ASAAS_API_KEY"]) {
    delete process.env[name];
  }

  const { pool, companyProfilesTable, workspaceProfilesTable } = await import("@workspace/db");
  const { default: app } = await import("../app");
  const { upsertPublications } = await import("../ingest/upsert-tenders");
  const { ACCOUNT_EXPORT_TABLES, ACCOUNT_EXPORT_WORKSPACE_TABLES, deleteAccount } = await import("../account/account-privacy-service");
  const { runDailyEmailDigest } = await import("../email/email-service");
  const { rebuildRecommendationsForUser, scheduleRecommendationRebuild } = await import("../recommendations/recommendation-service");
  const { MaintenanceInProgressError } = await import("../lib/api-error");
  const { withCutoverGate } = await import("./cutover-gate");
  const { createWorkspace, defaultWorkspaceId } = await import("./workspace-service");
  const { companyProfileToWorkspaceProfile } = await import("./workspace-profile-service");

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
  const send = (method: string, path: string, cookie: string, body?: unknown) =>
    request(path, { method, headers: csrf, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, cookie);
  const one = async (text: string, values: unknown[] = []) => (await owner.query(text, values)).rows[0];
  const all = async (text: string, values: unknown[] = []) => (await owner.query(text, values)).rows;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const setState = (mode: "legacy" | "workspaces", writesPaused: boolean) =>
    owner.query(
      "insert into workspace_cutover_events (mode, writes_paused, actor, reason) values ($1, $2, 'teste', 'TEST')",
      [mode, writesPaused],
    );
  /** What the W3 delta does for every account inside the cutover transaction, then the mode switch. */
  const cutToWorkspaces = async () => {
    for (const { id } of await all("select id from users u where not exists (select 1 from workspaces w where w.owner_user_id = u.id)")) {
      await withCutoverGate({ kind: "http" }, (tx) =>
        createWorkspace(tx, { ownerUserId: id, type: "procurement", name: "Compras públicas", isDefault: true }),
      );
    }
    const cutter = await owner.connect();
    try {
      await cutter.query("begin");
      await cutter.query("set local lock_timeout = '5s'");
      await cutter.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [LOCK_KEY]);
      for (const legacy of await drizzle(cutter).select().from(companyProfilesTable)) {
        const converted = companyProfileToWorkspaceProfile(legacy);
        await drizzle(cutter)
          .insert(workspaceProfilesTable)
          .values({ workspaceId: defaultWorkspaceId(legacy.userId), ...converted })
          .onConflictDoNothing();
      }
      await cutter.query(
        "insert into user_workspace_preferences (user_id, active_workspace_id) select owner_user_id, id from workspaces where is_default on conflict do nothing",
      );
      for (const table of ["company_tender_fits", "saved_tenders", "saved_searches", "notifications", "email_deliveries", "recommendation_events", "recommendation_dismissals", "recommendation_interest_profiles", "user_recommendations", "ai_jobs"]) {
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
    [1, 2, 3].map((sequence) => ({
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

  const sent: string[] = [];
  const sendEmail = async (message: { to: string }) => {
    sent.push(message.to);
    return { status: "sent" as const, providerMessageId: `test-${sent.length}` };
  };
  type Account = { cookie: string; userId: string; email: string; marker: string; searchId: string; notificationId: string };
  /**
   * An account with something of its own in every table of the scope, written through the routes in the mode the
   * flag is in, and marked with a word nobody else has.
   */
  const seeded = async (label: string): Promise<Account> => {
    const email = `f-${label}@example.test`;
    const marker = `marca${label}`;
    const login = await request("/v1/auth/dev-login", { method: "POST", headers: csrf, body: JSON.stringify({ email, name: `TEST ${marker}` }) });
    assert.equal(login.status, 204);
    const cookie = login.headers.get("set-cookie")!.split(";", 1)[0]!;
    const userId = ((await (await request("/v1/auth/session", {}, cookie)).json()) as any).user.id as string;
    await owner.query("insert into subscriptions (user_id, status, current_period_end) values ($1, 'active', '2099-01-01T00:00:00Z')", [userId]);
    const ok = async (response: Promise<Response>, status = 200) => {
      const result = await response;
      assert.equal(result.status, status, `${label}: ${result.url}`);
      return result;
    };
    await ok(
      send("PUT", "/v1/me/company-profile", cookie, {
        description: `Fornecemos computadores e suporte técnico corporativo ${marker}.`,
        offerings: ["computadores", marker],
        exclusions: [],
        selectedCategories: [],
        selectedKeywords: [],
        excludedKeywords: [],
        coverage: { scope: "national", mode: "strict", acceptsRemote: false },
        valueRange: { min: null, max: null },
        size: "me_epp",
      }),
    );
    const search = (await (await ok(send("POST", "/v1/me/saved-searches", cookie, { name: `Busca ${marker}`, query: `q=${marker}`, alertsEnabled: false }), 201)).json()) as { id: string };
    await ok(send("PUT", `/v1/me/saved-tenders/${tenderIdOf(1)}`, cookie, { monitored: true, nextAction: `Proposta ${marker}` }));
    await ok(send("PUT", "/v1/me/recommendation-preferences", cookie, { personalizationEnabled: true }));
    await ok(send("POST", "/v1/recommendations/events", cookie, { type: "search", query: `${marker} computadores` }), 202);
    await ok(send("POST", `/v1/recommendations/${tenderIdOf(2)}/dismiss`, cookie), 204);
    await ok(request(`/v1/me/fit?tenderIds=${encodeURIComponent(tenderIdOf(3))}`, {}, cookie));
    scheduleRecommendationRebuild(userId, 0);
    await sleep(400);
    await rebuildRecommendationsForUser(userId);
    const workspaceId = (await one("select workspace_id from saved_tenders where user_id = $1", [userId])).workspace_id as string | null;
    const notificationId = randomUUID();
    await owner.query(
      `insert into notifications (id, user_id, workspace_id, type, dedupe_key, created_at, tender_id, tender_title, change)
       values ($1, $2, $3, 'tender_deadline_changed', $4, now() - interval '1 hour', $5, $6,
         '{"field":"proposalDeadline","from":"2099-10-30T20:00:00.000Z","to":"2099-11-05T20:00:00.000Z"}')`,
      [notificationId, userId, workspaceId, `tender:test:${notificationId}`, tenderIdOf(1), `Edital ${marker}`],
    );
    await owner.query(
      `insert into ai_ask_requests (id, user_id, tender_id, question, normalized_question, index_version, requested_model, status)
       values ($1, $2, $3, $4, $4, 1, 'jev-test', 'answered')`,
      [randomUUID(), userId, tenderIdOf(1), `pergunta ${marker}`],
    );
    return { cookie, userId, email, marker, searchId: search.id, notificationId };
  };
  const exportOf = async (who: Account) => {
    const response = await request("/v1/me/export", {}, who.cookie);
    assert.equal(response.status, 200);
    return (await response.json()) as Record<string, any>;
  };
  /** Rows of every table that points to the account or to one of its workspaces, by table. */
  const footprint = async (userId: string, workspaceIds: string[]) => {
    const columns = await all(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public' and column_name in ('user_id', 'owner_user_id', 'workspace_id', 'active_workspace_id')
       order by table_name, column_name`,
    );
    const counts: Record<string, number> = {};
    for (const { table_name: table, column_name: column } of columns) {
      const byUser = column === "user_id" || column === "owner_user_id";
      const { count } = await one(
        `select count(*)::int as count from "${table}" where "${column}" = any($1::text[])`,
        [byUser ? [userId] : workspaceIds],
      );
      counts[`${table}.${column}`] = count;
    }
    return counts;
  };
  const workspacesOf = async (userId: string) => (await all("select id from workspaces where owner_user_id = $1", [userId])).map((row) => row.id as string);
  const nonZero = (counts: Record<string, number>) => Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));

  await t.test("every table that holds the user's data is in the export registries", async () => {
    const withColumn = async (column: string) =>
      (
        await all(
          `select c.table_name from information_schema.columns c
           join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
           where c.table_schema = 'public' and c.column_name = $1 and t.table_type = 'BASE TABLE' order by c.table_name`,
          [column],
        )
      ).map((row) => row.table_name as string);
    const byUser = await withColumn("user_id");
    assert.deepEqual(byUser, Object.keys(ACCOUNT_EXPORT_TABLES).sort());
    const byWorkspaceOnly = [...(await withColumn("workspace_id")), ...(await withColumn("owner_user_id"))].filter((table) => !byUser.includes(table));
    assert.deepEqual([...new Set(byWorkspaceOnly)].sort(), Object.keys(ACCOUNT_EXPORT_WORKSPACE_TABLES).sort());
  });

  const legacy = await seeded("legado");
  const legacyNeighbour = await seeded("vizinholegado");

  await t.test("legacy: the export keeps every section it had and adds the workspace ones, empty", async () => {
    await runDailyEmailDigest(new Date(), sendEmail);
    const body = await exportOf(legacy);
    for (const key of LEGACY_EXPORT_KEYS) assert.ok(key in body, `${key} is still in the export`);
    assert.deepEqual([body.workspaces, body.workspaceProfiles, body.workspaceProfileSignals, body.workspacePreference], [[], [], [], null]);
    for (const section of SCOPED_SECTIONS) {
      assert.ok(body[section].length > 0, `${section} has the account's rows`);
      assert.ok(body[section].every((row: any) => row.workspaceId === null), `${section}: legacy rows carry no workspace`);
    }
    assert.equal(body.recommendationInterestProfile.workspaceId, null);
    assert.ok(body.companyProfile.description.includes(legacy.marker));
    assert.deepEqual(body.emailDeliveries[0].notificationIds, [legacy.notificationId]);
    assert.equal(body.aiQuestions[0].question, `pergunta ${legacy.marker}`);
  });

  await t.test("isolation in legacy: nothing of another account is read, exported or changed", async () => isolation(legacy, legacyNeighbour));

  await cutToWorkspaces();
  const workspaces = await seeded("espacos");
  const neighbour = await seeded("vizinho");

  await t.test("workspaces: the export covers the workspace, its membership, profile, signals and preference, and every artifact says its workspace", async () => {
    await runDailyEmailDigest(new Date(), sendEmail);
    const workspaceId = defaultWorkspaceId(workspaces.userId);
    const body = await exportOf(workspaces);
    for (const key of LEGACY_EXPORT_KEYS) assert.ok(key in body, `${key} is still in the export`);
    assert.equal(body.workspaces.length, 1);
    const { createdAt: _created, updatedAt: _updated, memberSince: _since, lastSelectedAt, ...workspace } = body.workspaces[0];
    assert.deepEqual(workspace, {
      id: workspaceId,
      type: "procurement",
      name: "Compras públicas",
      isDefault: true,
      limitSlot: 1,
      onboardingStatus: "complete",
      showInternationalOpportunities: false,
      archivedAt: null,
      role: "owner",
    });
    assert.ok(lastSelectedAt, "the membership is exported with the workspace");
    assert.equal(body.workspacePreference.activeWorkspaceId, workspaceId);
    assert.equal(body.workspaceProfiles.length, 1);
    assert.equal(body.workspaceProfiles[0].workspaceId, workspaceId);
    assert.ok(JSON.stringify(body.workspaceProfiles[0].answers).includes(workspaces.marker));
    assert.ok(body.workspaceProfileSignals.length > 0, "the signals derived from the profile are exported");
    assert.ok(body.workspaceProfileSignals.every((signal: any) => signal.workspaceId === workspaceId));
    for (const section of SCOPED_SECTIONS) {
      assert.ok(body[section].length > 0, `${section} has the account's rows`);
      assert.ok(body[section].every((row: any) => row.workspaceId === workspaceId), `${section}: every row says its workspace`);
    }
    assert.equal(body.recommendationInterestProfile.workspaceId, workspaceId);
    assert.deepEqual(body.emailDeliveries[0].notificationIds, [workspaces.notificationId]);
    assert.equal(body.companyProfile, null, "an account born in workspaces has no legacy profile");
    assert.equal(body.aiQuestions[0].question, `pergunta ${workspaces.marker}`, "the question log stays with the account");

    // An account that came through the cutover has both models, and both are exported.
    const migrated = await exportOf(legacy);
    assert.ok(migrated.companyProfile.description.includes(legacy.marker));
    assert.ok(JSON.stringify(migrated.workspaceProfiles[0].answers).includes(legacy.marker));
    assert.equal(migrated.workspaces[0].id, defaultWorkspaceId(legacy.userId));
    assert.ok(migrated.savedTenders.every((row: any) => row.workspaceId === defaultWorkspaceId(legacy.userId)));
  });

  await t.test("isolation in workspaces: nothing of another account is read, exported or changed", async () => isolation(workspaces, neighbour));

  await t.test("after the flag is turned back the export still brings what the workspace tables hold", async () => {
    const inWorkspaces = await exportOf(workspaces);
    await setState("legacy", false);
    const { exportedAt: _then, sessions: _sessionsThen, ...before } = inWorkspaces;
    const { exportedAt: _now, sessions: _sessionsNow, ...after } = await exportOf(workspaces);
    assert.deepEqual(after, before);
    assert.equal(after.workspaces.length, 1);
    assert.equal(after.workspaceProfiles.length, 1);
    await setState("workspaces", false);
  });

  /** Negative side of the matrix for what exists today: `self` acts, `other` must stay untouched and unseen. */
  async function isolation(self: Account, other: Account) {
    const otherWorkspaces = await workspacesOf(other.userId);
    const before = await footprint(other.userId, otherWorkspaces);
    const fingerprint = () =>
      all(
        `select 'search' as kind, id, name, deleted_at::text as state from saved_searches where user_id = $1
         union all select 'notification', id, type, read_at::text from notifications where user_id = $1
         union all select 'saved', tender_id, stage, monitored::text from saved_tenders where user_id = $1
         union all select 'recommendation', tender_id, "rank"::text, null from user_recommendations where user_id = $1
         order by 1, 2`,
        [other.userId],
      );
    const rowsBefore = await fingerprint();

    const reads = [
      "/v1/me/saved-tenders", "/v1/me/saved-tenders/ids", "/v1/me/saved-searches", "/v1/me/notifications?pageSize=50",
      "/v1/me/notifications/unread-count", "/v1/recommendations?pageSize=50", "/v1/me/company-profile",
      "/v1/me/recommendation-preferences", `/v1/me/fit?tenderIds=${encodeURIComponent(tenderIdOf(3))}`,
    ];
    const foreign = [other.marker, other.userId, other.email, other.searchId, other.notificationId, ...otherWorkspaces];
    for (const path of reads) {
      const response = await request(path, {}, self.cookie);
      assert.equal(response.status, 200, path);
      assert.doesNotMatch(response.headers.get("cache-control") ?? "", /public/, `${path} is never publicly cacheable`);
      const text = await response.text();
      for (const value of foreign) assert.equal(text.includes(value), false, `${path} leaks ${value}`);
    }
    const exported = JSON.stringify(await exportOf(self));
    for (const value of foreign) assert.equal(exported.includes(value), false, `the export leaks ${value}`);
    assert.ok(exported.includes(self.marker));

    // Ids of the other account: refused or without effect, never a different answer that reveals them.
    assert.equal((await send("PATCH", `/v1/me/saved-searches/${other.searchId}`, self.cookie, { name: "Intrusão" })).status, 403);
    assert.equal((await send("DELETE", `/v1/me/saved-searches/${other.searchId}`, self.cookie)).status, 403);
    assert.equal((await send("POST", `/v1/me/saved-searches/${other.searchId}/restore`, self.cookie)).status, 403);
    assert.equal((await send("POST", `/v1/me/saved-searches/${other.searchId}/seen`, self.cookie)).status, 403);
    const mine = ((await (await request("/v1/me/notifications/unread-count", {}, self.cookie)).json()) as any).unreadCount;
    assert.deepEqual(await (await send("POST", "/v1/me/notifications/read", self.cookie, { ids: [other.notificationId] })).json(), { unreadCount: mine });
    const scoped = await request(`/v1/tenders/search?notification=${other.notificationId}&facets=false`, {}, self.cookie);
    assert.equal(scoped.headers.get("cache-control"), "no-store");
    assert.deepEqual(((await scoped.json()) as any).data, [], "another account's notification reads as missing");
    assert.equal((await send("DELETE", `/v1/me/saved-tenders/${tenderIdOf(1)}`, self.cookie)).status, 204);
    assert.equal((await send("PUT", `/v1/me/saved-tenders/${tenderIdOf(1)}`, self.cookie, { monitored: true, nextAction: `Proposta ${self.marker}` })).status, 200);
    assert.equal((await send("POST", `/v1/recommendations/${tenderIdOf(2)}/dismiss`, self.cookie)).status, 204);
    assert.equal((await send("DELETE", "/v1/me/recommendation-history", self.cookie)).status, 204);
    scheduleRecommendationRebuild(self.userId, 0);
    await sleep(400);

    assert.deepEqual(await fingerprint(), rowsBefore, "the other account's rows are exactly as they were");
    assert.deepEqual(await footprint(other.userId, otherWorkspaces), before);

    // Links: a delivery never carries a notification of another account, nor of another workspace.
    assert.deepEqual(
      await one(
        `select count(*) filter (where d.user_id <> n.user_id)::int as crossed_accounts,
           count(*) filter (where d.workspace_id is distinct from l.workspace_id)::int as crossed_workspaces
         from email_delivery_notifications l
         join email_deliveries d on d.id = l.delivery_id join notifications n on n.id = l.notification_id`,
      ),
      { crossed_accounts: 0, crossed_workspaces: 0 },
    );
  }

  await t.test("deletion removes the account from both models and leaves the neighbour whole, in workspaces and in legacy", async () => {
    for (const [mode, target, bystander] of [["workspaces", workspaces, neighbour], ["legacy", legacy, legacyNeighbour]] as const) {
      await setState(mode, false);
      const targetWorkspaces = await workspacesOf(target.userId);
      const bystanderWorkspaces = await workspacesOf(bystander.userId);
      assert.equal(targetWorkspaces.length, 1);
      const had = nonZero(await footprint(target.userId, targetWorkspaces));
      // The account that came through the cutover has no signals: the test's delta copies the profile only.
      const expected = ["workspaces.owner_user_id", "workspace_members.user_id", "workspace_profiles.workspace_id", "user_workspace_preferences.user_id", "saved_tenders.workspace_id", "notifications.user_id", "email_deliveries.user_id", "ai_ask_requests.user_id"];
      if (mode === "workspaces") expected.push("workspace_profile_signals.workspace_id");
      for (const table of expected) {
        assert.ok(had[table]! > 0, `${mode}: ${table} had rows of the account before the deletion`);
      }
      const bystanderBefore = await footprint(bystander.userId, bystanderWorkspaces);

      const deleted = await send("DELETE", "/v1/me", target.cookie, { confirm: "EXCLUIR" });
      assert.equal(deleted.status, 204);
      assert.deepEqual(nonZero(await footprint(target.userId, targetWorkspaces)), {}, `${mode}: nothing points to the account or to its workspace`);
      assert.equal((await request("/v1/auth/session", {}, target.cookie)).status, 401);
      assert.deepEqual(await footprint(bystander.userId, bystanderWorkspaces), bystanderBefore, `${mode}: the neighbour is untouched`);
      assert.equal((await exportOf(bystander)).savedTenders.length, 1);
    }
    await setState("workspaces", false);
  });

  await t.test("paused writes: the deletion answers 503 before the provider is asked to cancel anything; the export still answers", async () => {
    const paying = await seeded("pagante");
    await owner.query("update subscriptions set asaas_subscription_id = 'sub_test_1' where user_id = $1", [paying.userId]);
    const cancelled: string[] = [];
    const cancelAsaasSubscription = async (id: string) => void cancelled.push(id);
    const workspaceIds = await workspacesOf(paying.userId);
    const before = await footprint(paying.userId, workspaceIds);

    await setState("workspaces", true);
    const refused = await send("DELETE", "/v1/me", paying.cookie, { confirm: "EXCLUIR" });
    assert.equal(refused.status, 503);
    assert.equal(refused.headers.get("retry-after"), "60");
    assert.equal(((await refused.json()) as any).error.code, "MAINTENANCE_IN_PROGRESS");
    await assert.rejects(deleteAccount(paying.userId, { cancelAsaasSubscription }), MaintenanceInProgressError);
    assert.deepEqual(cancelled, [], "the subscription of an account that stays is not cancelled");
    assert.deepEqual(await footprint(paying.userId, workspaceIds), before);
    assert.equal((await request("/v1/me/export", {}, paying.cookie)).status, 200, "the right of access does not wait for the window");

    await setState("workspaces", false);
    await deleteAccount(paying.userId, { cancelAsaasSubscription });
    assert.deepEqual(cancelled, ["sub_test_1"]);
    assert.deepEqual(nonZero(await footprint(paying.userId, workspaceIds)), {});
  });
});
