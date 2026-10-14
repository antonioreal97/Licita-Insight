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
const SCOPED_TABLES = [
  "saved_tenders",
  "saved_searches",
  "recommendation_events",
  "recommendation_dismissals",
  "recommendation_interest_profiles",
  "user_recommendations",
] as const;
const TENDERS = 30;
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Timestamps, request ids and the random id of the saved search differ between two runs by construction. */
const normalize = (value: unknown, key = ""): unknown => {
  if (Array.isArray(value)) return value.map((entry) => normalize(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, normalize(entry, name)]));
  }
  return typeof value === "string" && (/(At|^at)$/.test(key) || key === "requestId" || UUID.test(value)) ? "<varies>" : value;
};

// Opt-in: creates and drops its own database next to PNCP_TEST_DATABASE_URL, so the cutover flag is its own.
test("v1 recommendations in legacy and workspaces modes", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  const databaseName = `licita_ws_d4_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
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
  process.env.SESSION_SECRET = "workspace-d4-integration-secret-at-least-32-characters";
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
  const { rebuildRecommendationsForUser, runDailyRecommendations, scheduleRecommendationRebuild } = await import(
    "../recommendations/recommendation-service"
  );
  const { CutoverModeChangedError, withCutoverGate } = await import("./cutover-gate");
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
  const send = (method: string, path: string, cookie: string, body?: unknown) =>
    request(path, { method, headers: csrf, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, cookie);
  const json = async (response: Promise<Response>) => (await response).json() as Promise<any>;
  const login = async (email: string, subscribed = true): Promise<{ cookie: string; userId: string }> => {
    const response = await request("/v1/auth/dev-login", {
      method: "POST",
      headers: csrf,
      body: JSON.stringify({ email, name: "TEST USER" }),
    });
    assert.equal(response.status, 204);
    const cookie = response.headers.get("set-cookie")!.split(";", 1)[0]!;
    const userId = (await json(request("/v1/auth/session", {}, cookie))).user.id as string;
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
  /** What the W3 delta does to the scoped tables inside the cutover transaction, then the mode switch. */
  const cutToWorkspaces = async (
    userId: string,
    options: { holdMs?: number; afterLock?: () => Promise<void> } = {},
  ): Promise<Record<(typeof SCOPED_TABLES)[number], number>> => {
    const cutter = await owner.connect();
    try {
      await cutter.query("begin");
      await cutter.query("set local lock_timeout = '5s'");
      await cutter.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [LOCK_KEY]);
      await options.afterLock?.();
      const assigned: Record<string, number> = {};
      for (const table of SCOPED_TABLES) {
        const result = await cutter.query(
          `update ${table} set workspace_id = $1 where user_id = $2 and workspace_id is null`,
          [defaultWorkspaceId(userId), userId],
        );
        assigned[table] = result.rowCount ?? 0;
      }
      await cutter.query(
        "insert into workspace_cutover_events (mode, writes_paused, actor, reason) values ('workspaces', false, 'teste', 'cut: TEST')",
      );
      await sleep(options.holdMs ?? 0);
      await cutter.query("commit");
      return assigned;
    } finally {
      cutter.release();
    }
  };

  const tenderIdOf = (sequence: number) => `00394460000141-1-${String(sequence).padStart(6, "0")}-2026`;
  await upsertPublications(
    Array.from({ length: TENDERS }, (_, index) => ({
      numeroControlePNCP: `00394460000141-1-${String(index + 1).padStart(6, "0")}/2026`,
      objetoCompra: `Aquisição de computadores e notebooks para TEST DATA ${index + 1}`,
      numeroCompra: String(index + 1),
      anoCompra: 2026,
      modalidadeId: 6,
      modalidadeNome: "Pregão - Eletrônico",
      situacaoCompraNome: "Divulgada no PNCP",
      dataPublicacaoPncp: `2026-08-${String(index + 1).padStart(2, "0")}T09:00:00`,
      dataEncerramentoProposta: `2099-10-${String(index + 1).padStart(2, "0")}T17:00:00`,
      dataAtualizacao: "2026-09-23T10:00:00",
      valorTotalEstimado: 100,
      orcamentoSigilosoCodigo: 1,
      orgaoEntidade: { cnpj: "00394460000141", razaoSocial: "Órgão de teste" },
      unidadeOrgao: { ufSigla: "DF", municipioNome: "Brasília" },
    })),
    new Date(),
  );
  const [viewed, dismissed, interesting, monitored] = [1, 2, 3, 4].map(tenderIdOf) as [string, string, string, string];
  /** One clock for every scored rebuild, so the novelty and deadline components are the same in the two runs. */
  const scoringNow = new Date();

  /** Runs now the debounced rebuild the routes scheduled, so none fires in the middle of a later step. */
  const settle = async (userId: string) => {
    scheduleRecommendationRebuild(userId, 0);
    await sleep(400);
  };
  const stored = async (userId: string) => {
    const rows = async (text: string) => (await owner.query(text, [userId])).rows;
    return {
      events: await rows("select type, tender_id, normalized_terms, workspace_id from recommendation_events where user_id = $1 order by occurred_at, type"),
      dismissals: await rows("select tender_id, terms, workspace_id from recommendation_dismissals where user_id = $1 order by tender_id"),
      interest: await rows(
        "select signal_count, profile->'terms' as terms, workspace_id from recommendation_interest_profiles where user_id = $1",
      ),
      recommendations: await rows('select tender_id, "rank", score, reasons, workspace_id from user_recommendations where user_id = $1 order by "rank"'),
    };
  };
  const metrics = async () =>
    (await owner.query("select sum(impressions)::int as impressions, sum(clicks)::int as clicks, sum(interests)::int as interests, sum(dismissals)::int as dismissals from recommendation_metrics_daily")).rows[0];
  const event = (cookie: string, body: unknown) => send("POST", "/v1/recommendations/events", cookie, body);
  const preferences = (cookie: string, body: unknown) => send("PUT", "/v1/me/recommendation-preferences", cookie, body);

  /** The v1 contract of recommendations, their events, history and preferences, as the UI calls it. */
  const contract = async (cookie: string, userId: string, inspect: () => Promise<void>) => {
    const answers: Array<[string, number, unknown]> = [];
    const record = async (label: string, response: Promise<Response>) => {
      const result = await response;
      answers.push([label, result.status, result.status === 204 ? null : normalize(await result.json())]);
    };
    await record("preferences", request("/v1/me/recommendation-preferences", {}, cookie));
    await record("recommendations without signals", request("/v1/recommendations", {}, cookie));
    await record("search event without opt-in", event(cookie, { type: "search", query: "computadores" }));
    await record("save a search", send("POST", "/v1/me/saved-searches", cookie, { name: "Notebooks", query: "q=notebooks", alertsEnabled: false }));
    await record("monitor a tender", send("PUT", `/v1/me/saved-tenders/${monitored}`, cookie, { monitored: true }));
    await record("opt in", preferences(cookie, { personalizationEnabled: true }));
    await record("search event", event(cookie, { type: "search", query: "Aquisição de computadores" }));
    await record("search event without terms", event(cookie, { type: "search", query: "de para o" }));
    await record("view event", event(cookie, { type: "tender_view", tenderId: viewed }));
    await record("view of unknown tender", event(cookie, { type: "tender_view", tenderId: "does-not-exist" }));
    await record("invalid event", event(cookie, { type: "purchase" }));
    await record("click event", event(cookie, { type: "click" }));
    await settle(userId);
    await rebuildRecommendationsForUser(userId, scoringNow);
    await record("recommendations", request("/v1/recommendations?pageSize=50", {}, cookie));
    await record("recommendations second page", request("/v1/recommendations?page=2&pageSize=5", {}, cookie));
    await record("invalid pagination", request("/v1/recommendations?pageSize=0", {}, cookie));
    await record("dismiss", send("POST", `/v1/recommendations/${dismissed}/dismiss`, cookie));
    await record("dismiss again", send("POST", `/v1/recommendations/${dismissed}/dismiss`, cookie));
    await record("dismiss unknown tender", send("POST", "/v1/recommendations/does-not-exist/dismiss", cookie));
    await settle(userId);
    await rebuildRecommendationsForUser(userId, scoringNow);
    await record("recommendations after dismiss", request("/v1/recommendations?pageSize=50", {}, cookie));
    await record("interest event", event(cookie, { type: "interest", tenderId: interesting }));
    await record("interest event again", event(cookie, { type: "interest", tenderId: interesting }));
    await record("recommendations after interest", request("/v1/recommendations?pageSize=50", {}, cookie));
    await inspect();
    await record("erase history", send("DELETE", "/v1/me/recommendation-history", cookie));
    await settle(userId);
    await rebuildRecommendationsForUser(userId, scoringNow);
    await record("recommendations after erasing history", request("/v1/recommendations?pageSize=50", {}, cookie));
    await record("opt out", preferences(cookie, { personalizationEnabled: false }));
    await record("search event after opt-out", event(cookie, { type: "search", query: "computadores" }));
    await record("preferences at the end", request("/v1/me/recommendation-preferences", {}, cookie));
    await settle(userId);
    return answers;
  };

  const denied = async (cookie: string) =>
    Promise.all(
      [
        request("/v1/recommendations", {}, cookie),
        send("POST", `/v1/recommendations/${viewed}/dismiss`, cookie),
        request("/v1/me/recommendation-preferences", {}, cookie),
        event(cookie, { type: "search", query: "computadores" }),
      ].map(async (response) => (await response).status),
    );

  const legacyUser = await login("d4-legacy@example.test");
  const unsubscribed = await login("d4-unsubscribed@example.test", false);
  let legacyRows = await stored(legacyUser.userId);
  const legacyAnswers = await contract(legacyUser.cookie, legacyUser.userId, async () => {
    legacyRows = await stored(legacyUser.userId);
  });
  const legacyMetrics = await metrics();
  const deniedInLegacy = await denied(unsubscribed.cookie);

  const workspacesUser = await login("d4-workspaces@example.test");
  const workspaceId = defaultWorkspaceId(workspacesUser.userId);
  // Until unit D5 creates it with the account, every account that is used in workspaces mode gets its default here.
  for (const { userId } of [workspacesUser, unsubscribed]) await createDefaultWorkspace(userId);
  await setState("workspaces", false);
  let workspacesRows = legacyRows;
  const workspacesAnswers = await contract(workspacesUser.cookie, workspacesUser.userId, async () => {
    workspacesRows = await stored(workspacesUser.userId);
  });
  const bothMetrics = await metrics();
  const deniedInWorkspaces = await denied(unsubscribed.cookie);

  await t.test("the v1 contract answers the same payloads in legacy and in workspaces", () => {
    assert.deepEqual(workspacesAnswers, legacyAnswers);
    assert.deepEqual(
      legacyAnswers.map(([label, status]) => `${label}: ${status}`),
      [
        "preferences: 200",
        "recommendations without signals: 200",
        "search event without opt-in: 202",
        "save a search: 201",
        "monitor a tender: 200",
        "opt in: 200",
        "search event: 202",
        "search event without terms: 202",
        "view event: 202",
        "view of unknown tender: 404",
        "invalid event: 400",
        "click event: 202",
        "recommendations: 200",
        "recommendations second page: 200",
        "invalid pagination: 400",
        "dismiss: 204",
        "dismiss again: 204",
        "dismiss unknown tender: 404",
        "recommendations after dismiss: 200",
        "interest event: 202",
        "interest event again: 202",
        "recommendations after interest: 200",
        "erase history: 204",
        "recommendations after erasing history: 200",
        "opt out: 200",
        "search event after opt-out: 202",
        "preferences at the end: 200",
      ],
    );
    const byLabel = new Map(legacyAnswers.map(([label, , body]) => [label, body as Record<string, any>]));
    const ids = (label: string) => byLabel.get(label)!.data.map((item: any) => item.tender.id) as string[];
    assert.equal(byLabel.get("preferences")!.personalizationEnabled, false, "the opt-in is born off");
    assert.deepEqual(byLabel.get("recommendations without signals")!.data, []);
    assert.deepEqual(byLabel.get("search event without opt-in"), { recorded: false });
    assert.deepEqual(byLabel.get("search event"), { recorded: true });
    assert.deepEqual(byLabel.get("search event without terms"), { recorded: false });
    const first = ids("recommendations");
    assert.equal(first.length, TENDERS - 1, "every open tender but the monitored one");
    assert.ok(!first.includes(monitored) && first.includes(dismissed) && first.includes(interesting));
    assert.ok(byLabel.get("recommendations")!.data.every((item: any) => item.reasons.length > 0 && item.score > 0));
    assert.equal(byLabel.get("recommendations second page")!.data.length, 5);
    assert.deepEqual(ids("recommendations after dismiss"), first.filter((id) => id !== dismissed));
    assert.deepEqual(byLabel.get("interest event"), { recorded: true });
    assert.deepEqual(byLabel.get("interest event again"), { recorded: false });
    assert.deepEqual(ids("recommendations after interest"), first.filter((id) => id !== dismissed && id !== interesting));
    assert.equal(
      ids("recommendations after erasing history").length,
      TENDERS - 2,
      "saved tenders and saved searches still recommend without the history; only the dismissal and the monitoring exclude",
    );
    assert.deepEqual(byLabel.get("search event after opt-out"), { recorded: false });
    assert.equal(byLabel.get("preferences at the end")!.personalizationEnabled, false);
  });

  await t.test("stored rows hold the same fields in both modes; in workspaces they carry the default workspace", () => {
    assert.deepEqual(
      [legacyRows.events.length, legacyRows.dismissals.length, legacyRows.interest.length, legacyRows.recommendations.length],
      [2, 1, 1, TENDERS - 3],
    );
    assert.equal(legacyRows.interest[0].signal_count, 5, "the saved search, the monitored tender (twice) and the two opt-in events");
    for (const table of Object.values(legacyRows)) assert.ok(table.every((row) => row.workspace_id === null), "legacy writes today's rows");
    for (const table of Object.values(workspacesRows)) assert.ok(table.every((row) => row.workspace_id === workspaceId));
    const comparable = (rows: typeof legacyRows) =>
      Object.fromEntries(Object.entries(rows).map(([table, list]) => [table, list.map((row) => ({ ...row, workspace_id: null }))]));
    assert.deepEqual(comparable(workspacesRows), comparable(legacyRows));
  });

  await t.test("the opt-in stays with the account and the daily metrics stay global", async () => {
    const consent = await owner.query(
      "select recommendation_personalization_enabled as enabled from users where id = any($1::text[])",
      [[legacyUser.userId, workspacesUser.userId]],
    );
    assert.deepEqual(consent.rows, [{ enabled: false }, { enabled: false }]);
    assert.ok(legacyMetrics.impressions > 0 && legacyMetrics.clicks === 1 && legacyMetrics.interests === 1 && legacyMetrics.dismissals === 2);
    assert.deepEqual(
      bothMetrics,
      Object.fromEntries(Object.entries(legacyMetrics).map(([field, value]) => [field, Number(value) * 2])),
      "the workspaces run counted the same in the same table",
    );
  });

  await t.test("the subscription gate answers the same in both modes, before the workspace is resolved", () => {
    // Recommendation privacy preferences are available before the account router subscription gate.
    assert.deepEqual(deniedInLegacy, [402, 402, 200, 202]);
    assert.deepEqual(deniedInWorkspaces, deniedInLegacy);
  });

  /** An account with signals of every source, opted in, built in the mode the flag is in. */
  const prepare = async (email: string) => {
    const account = await login(email);
    await createDefaultWorkspace(account.userId);
    assert.equal((await send("POST", "/v1/me/saved-searches", account.cookie, { name: "Notebooks", query: "q=notebooks", alertsEnabled: false })).status, 201);
    assert.equal((await preferences(account.cookie, { personalizationEnabled: true })).status, 200);
    assert.equal((await event(account.cookie, { type: "search", query: "computadores" })).status, 202);
    await settle(account.userId);
    return account;
  };

  await t.test("a rebuild that crosses the cutover writes nothing and the next one writes in the new model", async () => {
    await setState("legacy", false);
    const crossing = await prepare("d4-crossing@example.test");
    await owner.query("delete from user_recommendations where user_id = $1", [crossing.userId]);
    await owner.query("delete from recommendation_interest_profiles where user_id = $1", [crossing.userId]);
    let rebuild: Promise<unknown> | undefined;
    await cutToWorkspaces(crossing.userId, {
      // The rebuild reads `legacy`, then waits for the lock this transaction holds while it switches the mode.
      afterLock: async () => {
        rebuild = rebuildRecommendationsForUser(crossing.userId, scoringNow).then(
          (count) => count,
          (error) => error,
        );
        await sleep(300);
      },
    });
    assert.ok((await rebuild) instanceof CutoverModeChangedError);
    const afterCrossing = await stored(crossing.userId);
    assert.deepEqual([afterCrossing.interest, afterCrossing.recommendations], [[], []]);

    assert.equal(await rebuildRecommendationsForUser(crossing.userId, scoringNow), TENDERS);
    const rebuilt = await stored(crossing.userId);
    const workspace = defaultWorkspaceId(crossing.userId);
    assert.ok(rebuilt.recommendations.length === TENDERS && rebuilt.recommendations.every((row) => row.workspace_id === workspace));
    assert.equal(rebuilt.interest[0].workspace_id, workspace);
    assert.equal((await json(request("/v1/recommendations?pageSize=50", {}, crossing.cookie))).data.length, TENDERS);
  });

  await t.test("cutover under concurrent events and dismissals: rows before the switch are assigned, rows after carry the workspace", async () => {
    await setState("legacy", false);
    const concurrent = await prepare("d4-concurrent@example.test");
    const workspace = defaultWorkspaceId(concurrent.userId);
    const before = await stored(concurrent.userId);
    const responses = Array.from({ length: 30 }, (_, index) =>
      sleep(index * 15).then(async () => {
        // Few dismissals: each one also lowers the score of the similar tenders left.
        const kind = index % 10 === 5 ? "dismissal" : "event";
        const response =
          kind === "event"
            ? await event(concurrent.cookie, { type: "search", query: `termo${index}` })
            : await send("POST", `/v1/recommendations/${tenderIdOf(index)}/dismiss`, concurrent.cookie);
        return { kind, index, status: response.status, body: response.status === 204 ? null : ((await response.json()) as any) };
      }),
    );
    await sleep(120);
    const assigned = await cutToWorkspaces(concurrent.userId, { holdMs: 200 });
    const results = await Promise.all(responses);
    await settle(concurrent.userId);

    assert.ok(results.every(({ status }) => [202, 204, 503].includes(status)), JSON.stringify(results.map(({ status }) => status)));
    const refused = results.filter(({ status }) => status === 503);
    assert.ok(refused.length > 0, "requests during the switch answer 503");
    assert.ok(refused.every(({ body }) => body.error.code === "MAINTENANCE_IN_PROGRESS"));
    const accepted = (kind: string) => results.filter((result) => result.kind === kind && result.status !== 503);
    const rows = await stored(concurrent.userId);
    assert.deepEqual(
      rows.events.slice(before.events.length).map((row) => row.normalized_terms[0]).sort(),
      accepted("event").map(({ index }) => `termo${index}`).sort(),
      "one event per accepted request, none for a refused one",
    );
    assert.deepEqual(rows.dismissals.map((row) => row.tender_id), accepted("dismissal").map(({ index }) => tenderIdOf(index)).sort());
    const written = accepted("event").length + accepted("dismissal").length;
    const assignedBefore = assigned.recommendation_events - before.events.length + assigned.recommendation_dismissals;
    assert.ok(assignedBefore > 0, "some requests landed in legacy before the switch");
    assert.ok(assignedBefore < written, "requests after the switch were written by the workspaces path");
    for (const table of Object.values(rows)) assert.ok(table.every((row) => row.workspace_id === workspace), "no legacy row after the switch");
    const listed = (await json(request("/v1/recommendations?pageSize=50", {}, concurrent.cookie))).data.map((item: any) => item.tender.id);
    assert.ok(rows.dismissals.every((row) => !listed.includes(row.tender_id)), "a dismissed tender never comes back");
    assert.equal(rows.interest[0].signal_count, 1 + rows.events.length, "the rebuild after the switch read the saved search and every event, assigned or new");
  });

  await t.test("paused writes: mutations answer 503 and write nothing, rebuilds do not start, reads still answer 200", async () => {
    await setState("workspaces", false);
    const paused = await prepare("d4-paused@example.test");
    const silent = await login("d4-silent@example.test");
    await createDefaultWorkspace(silent.userId);
    for (const mode of ["workspaces", "legacy"] as const) {
      await setState(mode, false);
      const before = [await stored(paused.userId), await stored(silent.userId)];
      await setState(mode, true);
      const refused = await event(paused.cookie, { type: "search", query: "durante a pausa" });
      assert.equal(refused.status, 503);
      assert.equal(refused.headers.get("retry-after"), "60");
      assert.equal(((await refused.json()) as any).error.code, "MAINTENANCE_IN_PROGRESS");
      const mutations = [
        event(paused.cookie, { type: "tender_view", tenderId: viewed }),
        event(paused.cookie, { type: "interest", tenderId: viewed }),
        send("POST", `/v1/recommendations/${viewed}/dismiss`, paused.cookie),
        send("DELETE", "/v1/me/recommendation-history", paused.cookie),
        preferences(paused.cookie, { personalizationEnabled: false }),
      ];
      for (const mutation of mutations) assert.equal((await mutation).status, 503);
      assert.deepEqual(await json(event(silent.cookie, { type: "search", query: "computadores" })), { recorded: false }, "without the opt-in nothing would be written, so nothing is refused");
      assert.deepEqual(await json(event(paused.cookie, { type: "click" })), { recorded: true }, "the global counter is outside the gate");
      assert.equal(await rebuildRecommendationsForUser(paused.userId, scoringNow), 0, "a cycle does not start while writes are paused");
      assert.deepEqual(await runDailyRecommendations(), { users: 0, recommendations: 0, deletedEvents: 0 });
      const reads = [
        request("/v1/recommendations", {}, paused.cookie),
        request("/v1/recommendations", {}, silent.cookie),
        request("/v1/me/recommendation-preferences", {}, paused.cookie),
      ];
      for (const read of reads) assert.equal((await read).status, 200);
      await settle(paused.userId);
      assert.deepEqual([await stored(paused.userId), await stored(silent.userId)], before);
    }
    await setState("workspaces", false);
  });

  await t.test("the daily job rebuilds every account in the model of the flag and erases expired events", async () => {
    const withoutWorkspace = await owner.query(
      "select id from users u where not exists (select 1 from workspaces w where w.owner_user_id = u.id)",
    );
    for (const { id } of withoutWorkspace.rows) await createDefaultWorkspace(id);
    for (const table of SCOPED_TABLES) {
      await owner.query(`update ${table} t set workspace_id = w.id from workspaces w where w.owner_user_id = t.user_id and t.workspace_id is null`);
    }
    await owner.query(
      "insert into recommendation_events (user_id, type, normalized_terms, occurred_at, workspace_id) values ($1, 'search', '[\"antigo\"]', now() - interval '181 days', $2)",
      [workspacesUser.userId, workspaceId],
    );
    const accounts = (await owner.query("select count(*)::int as count from users")).rows[0].count;
    const result = await runDailyRecommendations();
    assert.equal(result.users, accounts);
    assert.equal(result.deletedEvents, 1);
    assert.ok(result.recommendations > 0);
    const unstamped = await owner.query(
      "select (select count(*)::int from user_recommendations where workspace_id is null) as recommendations, (select count(*)::int from recommendation_interest_profiles where workspace_id is null) as interest",
    );
    assert.deepEqual(unstamped.rows[0], { recommendations: 0, interest: 0 });
  });

  await t.test("rows written in workspaces stay readable and writable by legacy after the flag is turned off", async () => {
    const account = await prepare("d4-rollback@example.test");
    const workspace = defaultWorkspaceId(account.userId);
    assert.equal((await send("POST", `/v1/recommendations/${dismissed}/dismiss`, account.cookie)).status, 204);
    await settle(account.userId);
    await rebuildRecommendationsForUser(account.userId, scoringNow);
    const read = () =>
      Promise.all([
        json(request("/v1/recommendations?pageSize=50", {}, account.cookie)),
        json(request("/v1/me/recommendation-preferences", {}, account.cookie)),
      ]);
    const inWorkspaces = await read();
    assert.equal(inWorkspaces[0].data.length, TENDERS - 1);

    // No reverse copy for the four tables: the legacy keys are intact until W4.
    await setState("legacy", false);
    assert.deepEqual(await read(), inWorkspaces);

    assert.deepEqual(await json(event(account.cookie, { type: "tender_view", tenderId: viewed })), { recorded: true });
    assert.equal((await send("POST", `/v1/recommendations/${interesting}/dismiss`, account.cookie)).status, 204);
    assert.equal((await send("POST", `/v1/recommendations/${dismissed}/dismiss`, account.cookie)).status, 204, "legacy refreshes the dismissal written in workspaces");
    await settle(account.userId);
    await rebuildRecommendationsForUser(account.userId, scoringNow);
    const rows = await stored(account.userId);
    assert.deepEqual(rows.events.map((row) => [row.type, row.workspace_id]), [["search", workspace], ["tender_view", null]]);
    assert.deepEqual(rows.dismissals.map((row) => [row.tender_id, row.workspace_id]), [[dismissed, workspace], [interesting, null]]);
    assert.ok(rows.recommendations.length === TENDERS - 2 && rows.recommendations.every((row) => row.workspace_id === null), "legacy rewrites the list as today's rows");
    const inLegacy = await read();
    assert.equal(inLegacy[0].data.length, TENDERS - 2, "the dismissal written in workspaces still excludes its tender in legacy");

    const assigned = await cutToWorkspaces(account.userId);
    assert.deepEqual(
      [assigned.recommendation_events, assigned.recommendation_dismissals, assigned.user_recommendations],
      [1, 1, TENDERS - 2],
      "the next cutover assigns what legacy wrote",
    );
    assert.deepEqual(await read(), inLegacy);
  });
});
