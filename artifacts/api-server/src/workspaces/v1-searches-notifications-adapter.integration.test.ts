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
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Timestamps, request ids and search timing differ between two runs by construction, and so do the random ids of
 * saved searches and notifications (also inside error messages): each id becomes its order of first appearance, so
 * references still have to match.
 */
const normalizer = () => {
  const ids = new Map<string, string>();
  const normalize = (value: unknown, key = ""): unknown => {
    if (key === "tookMs") return "<varies>";
    if (Array.isArray(value)) return value.map((entry) => normalize(entry));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, normalize(entry, name)]));
    }
    if (typeof value !== "string") return value;
    if (/(At|^at)$/.test(key) || key === "requestId") return "<varies>";
    return value.replace(UUID, (id) => {
      if (!ids.has(id)) ids.set(id, `<id ${ids.size + 1}>`);
      return ids.get(id)!;
    });
  };
  return (value: unknown) => normalize(value);
};

// Opt-in: creates and drops its own database next to PNCP_TEST_DATABASE_URL, so the cutover flag is its own.
test("v1 saved searches and notifications in legacy and workspaces modes", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  const databaseName = `licita_ws_d3_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
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
  process.env.SESSION_SECRET = "workspace-d3-integration-secret-at-least-32-characters";
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
  const { createTrialEndingNotifications, evaluateSavedSearchNotifications } = await import(
    "../account/notification-service"
  );
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
  const send = (method: string, path: string, cookie: string, body?: unknown) =>
    request(path, { method, headers: csrf, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, cookie);
  const json = async (response: Promise<Response>) => (await response).json() as Promise<any>;
  type Access = "subscribed" | "trial ending" | "none";
  const login = async (email: string, access: Access = "subscribed"): Promise<{ cookie: string; userId: string }> => {
    const response = await request("/v1/auth/dev-login", {
      method: "POST",
      headers: csrf,
      body: JSON.stringify({ email, name: "TEST USER" }),
    });
    assert.equal(response.status, 204);
    const cookie = response.headers.get("set-cookie")!.split(";", 1)[0]!;
    const userId = (await json(request("/v1/auth/session", {}, cookie))).user.id as string;
    await owner.query(
      {
        subscribed: "insert into subscriptions (user_id, status, current_period_end) values ($1, 'active', '2099-01-01T00:00:00Z')",
        "trial ending": "update users set trial_ends_at = now() + interval '1 day' where id = $1",
        none: "update users set trial_ends_at = '2000-01-01T00:00:00Z' where id = $1",
      }[access],
      [userId],
    );
    return { cookie, userId };
  };
  /** The default workspace W3 (or account creation, unit D5) gives every account; created here like the backfill. */
  const createDefaultWorkspace = (userId: string) =>
    withCutoverGate({ kind: "http" }, (tx) =>
      createWorkspace(tx, { ownerUserId: userId, type: "procurement", name: "Licitações", isDefault: true }),
    );
  const setState = (mode: "legacy" | "workspaces", writesPaused: boolean) =>
    owner.query(
      "insert into workspace_cutover_events (mode, writes_paused, actor, reason) values ($1, $2, 'teste', 'TEST')",
      [mode, writesPaused],
    );
  /** What the W3 delta does to the two tables inside the cutover transaction, then the mode switch. */
  const cutToWorkspaces = async (
    userId: string,
    options: { holdMs?: number; afterLock?: () => Promise<void> } = {},
  ): Promise<{ searches: number; notifications: number }> => {
    const cutter = await owner.connect();
    try {
      await cutter.query("begin");
      await cutter.query("set local lock_timeout = '5s'");
      await cutter.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [LOCK_KEY]);
      await options.afterLock?.();
      const assign = (table: string) =>
        cutter.query(`update ${table} set workspace_id = $1 where user_id = $2 and workspace_id is null`, [
          defaultWorkspaceId(userId),
          userId,
        ]);
      const searches = await assign("saved_searches");
      const notifications = await assign("notifications");
      await cutter.query(
        "insert into workspace_cutover_events (mode, writes_paused, actor, reason) values ('workspaces', false, 'teste', 'cut: TEST')",
      );
      await sleep(options.holdMs ?? 0);
      await cutter.query("commit");
      return { searches: searches.rowCount ?? 0, notifications: notifications.rowCount ?? 0 };
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
    dataPublicacaoPncp: `2026-08-${String(sequence).padStart(2, "0")}T09:00:00`,
    dataEncerramentoProposta: `2099-10-${String(sequence).padStart(2, "0")}T17:00:00`,
    dataAtualizacao: "2026-09-23T10:00:00",
    valorTotalEstimado: 100,
    orcamentoSigilosoCodigo: 1,
    orgaoEntidade: { cnpj: "00394460000141", razaoSocial: "Órgão de teste" },
    unidadeOrgao: { ufSigla: "DF", municipioNome: "Brasília" },
    ...overrides,
  });
  await upsertPublications(
    Array.from({ length: 6 }, (_, index) => publication(index + 1)),
    new Date(),
  );
  const matching = [1, 2, 3].map(tenderIdOf);
  const monitoredTender = tenderIdOf(5);
  await owner.query("update tenders set created_at = '2026-09-01T00:00:00Z'");

  /** Makes the three tenders new for whoever saved the search before this moment, then runs the 15-minute job. */
  const evaluate = async () => {
    await sleep(5);
    await owner.query("update tenders set created_at = $1 where id = any($2::text[])", [new Date(), matching]);
    await sleep(5);
    await evaluateSavedSearchNotifications(new Date());
  };
  /** A notification as the collection creates it today: no workspace, in either mode (the jobs are unit E). */
  const collected = (userId: string, tenderId = monitoredTender) =>
    owner.query(
      `insert into notifications (id, user_id, type, dedupe_key, created_at, tender_id, tender_title, change)
       values ($1, $2, 'tender_deadline_changed', $3, now() - interval '1 hour', $4, 'Aquisição de computadores TEST DATA',
         '{"field":"proposalDeadline","from":"2099-10-05T20:00:00.000Z","to":"2099-11-05T20:00:00.000Z"}')`,
      [randomUUID(), userId, `tender:${tenderId}:proposalDeadline:${randomUUID()}`, tenderId],
    );
  const storedSearches = async (userId: string) =>
    (
      await owner.query(
        `select name, query, alerts_enabled, deleted_at is not null as deleted, last_checked_at is not null as has_checkpoint,
           new_matches_count, workspace_id
         from saved_searches where user_id = $1 order by created_at`,
        [userId],
      )
    ).rows;
  const storedNotifications = async (userId: string) =>
    (
      await owner.query(
        `select type, read_at is not null as read, match_count, tender_ids, workspace_id,
           split_part(dedupe_key, ':', 1) as dedupe_prefix
         from notifications where user_id = $1 order by type, created_at, id`,
        [userId],
      )
    ).rows;

  const stranger = await login("d3-stranger@example.test");
  const foreignSearch = (
    await json(send("POST", "/v1/me/saved-searches", stranger.cookie, { name: "Alheia", query: "q=segredo", alertsEnabled: false }))
  ).id as string;
  const foreignNotification = randomUUID();
  await owner.query(
    `insert into notifications (id, user_id, type, dedupe_key, saved_search_id, saved_search_name, saved_search_query, match_count, tender_ids)
     values ($1, $2, 'saved_search_new_matches', 'test:foreign', $3, 'Alheia', 'q=segredo', 1, $4)`,
    [foreignNotification, stranger.userId, foreignSearch, JSON.stringify([tenderIdOf(6)])],
  );

  /** The v1 contract of saved searches and notifications, as the UI calls it. */
  const contract = async (cookie: string, userId: string, inspect: () => Promise<void>) => {
    const normalize = normalizer();
    const answers: Array<[string, number, unknown]> = [];
    const record = async (label: string, response: Promise<Response>) => {
      const result = await response;
      const body = result.status === 204 ? null : await result.json();
      answers.push([label, result.status, normalize(body)]);
      return body as any;
    };
    const searches = "/v1/me/saved-searches";
    await record("list searches empty", request(searches, {}, cookie));
    await record("notifications empty", request("/v1/me/notifications", {}, cookie));
    const first = await record("create search", send("POST", searches, cookie, { name: "Computadores", query: "?q=computadores&page=2", alertsEnabled: true }));
    await record("create duplicate", send("POST", searches, cookie, { name: "Duplicada", query: "q=computadores&page=9", alertsEnabled: false }));
    await record("create without alerts flag", send("POST", searches, cookie, { name: "Inválida", query: "q=notebooks" }));
    const second = await record("create second search", send("POST", searches, cookie, { name: "Notebooks", query: "q=notebooks", alertsEnabled: false }));
    await record("rename", send("PATCH", `${searches}/${first.id}`, cookie, { name: "Computadores e periféricos" }));
    await record("change query to a duplicate", send("PATCH", `${searches}/${second.id}`, cookie, { query: "q=computadores" }));
    await record("enable alerts", send("PATCH", `${searches}/${second.id}`, cookie, { alertsEnabled: true }));
    await record("patch nothing", send("PATCH", `${searches}/${first.id}`, cookie, {}));
    await record("patch missing search", send("PATCH", `${searches}/${randomUUID()}`, cookie, { name: "Fantasma" }));
    await record("patch someone else's search", send("PATCH", `${searches}/${foreignSearch}`, cookie, { name: "Intrusão" }));
    await record("delete someone else's search", send("DELETE", `${searches}/${foreignSearch}`, cookie));

    await evaluate();
    await collected(userId);
    await record("list searches after evaluation", request(searches, {}, cookie));
    const feed = await record("notifications", request("/v1/me/notifications", {}, cookie));
    await record("unread count", request("/v1/me/notifications/unread-count", {}, cookie));
    const alert = feed.data.find((item: any) => item.type === "saved_search_new_matches");
    await record("search by notification", request(`/v1/tenders/search?notification=${alert.id}&facets=false`, {}, cookie));
    await record("search by someone else's notification", request(`/v1/tenders/search?notification=${foreignNotification}&facets=false`, {}, cookie));
    await record("mark search seen", send("POST", `${searches}/${first.id}/seen`, cookie));
    await record("mark one read", send("POST", "/v1/me/notifications/read", cookie, { ids: [alert.id, foreignNotification] }));
    await record("unread only", request("/v1/me/notifications?unreadOnly=true", {}, cookie));
    await record("mark nothing", send("POST", "/v1/me/notifications/read", cookie, {}));
    await record("mark all read", send("POST", "/v1/me/notifications/read", cookie, { all: true }));
    await record("notifications second page", request("/v1/me/notifications?page=2&pageSize=1", {}, cookie));

    await record("delete search", send("DELETE", `${searches}/${first.id}`, cookie));
    await record("list searches after delete", request(searches, {}, cookie));
    await record("mark deleted search seen", send("POST", `${searches}/${first.id}/seen`, cookie));
    await record("restore search", send("POST", `${searches}/${first.id}/restore`, cookie));
    await record("delete search again", send("DELETE", `${searches}/${first.id}`, cookie));
    await owner.query("update saved_searches set deleted_at = now() - interval '31 seconds' where id = $1", [first.id]);
    await record("restore after the window", send("POST", `${searches}/${first.id}/restore`, cookie));
    await record("list searches at the end", request(searches, {}, cookie));
    await inspect();
    return answers;
  };

  const denied = async (cookie: string) =>
    Promise.all(
      [
        request("/v1/me/saved-searches", {}, cookie),
        send("POST", "/v1/me/saved-searches", cookie, { name: "Negada", query: "q=negada", alertsEnabled: true }),
        request("/v1/me/notifications", {}, cookie),
        request("/v1/me/notifications/unread-count", {}, cookie),
        send("POST", "/v1/me/notifications/read", cookie, { all: true }),
      ].map(async (response) => [(await response).status, (await json(response)).error.code]),
    );

  const legacyUser = await login("d3-legacy@example.test");
  const unsubscribed = await login("d3-unsubscribed@example.test", "none");
  let legacyRows: unknown[][] = [];
  const legacyAnswers = await contract(legacyUser.cookie, legacyUser.userId, async () => {
    legacyRows = [await storedSearches(legacyUser.userId), await storedNotifications(legacyUser.userId)];
    assert.ok(legacyRows.flat().every((row: any) => row.workspace_id === null), "legacy writes today's rows");
  });
  const deniedInLegacy = await denied(unsubscribed.cookie);
  const legacyTrial = await login("d3-trial-legacy@example.test", "trial ending");
  assert.equal(await createTrialEndingNotifications(), 1);

  const workspacesUser = await login("d3-workspaces@example.test");
  const workspaceId = defaultWorkspaceId(workspacesUser.userId);
  await createDefaultWorkspace(workspacesUser.userId);
  await createDefaultWorkspace(legacyTrial.userId);
  await owner.query("update saved_searches set alerts_enabled = false where user_id = $1", [legacyUser.userId]);
  await setState("workspaces", false);
  let workspacesRows: unknown[][] = [];
  const workspacesAnswers = await contract(workspacesUser.cookie, workspacesUser.userId, async () => {
    workspacesRows = [await storedSearches(workspacesUser.userId), await storedNotifications(workspacesUser.userId)];
  });
  const deniedInWorkspaces = await denied(unsubscribed.cookie);

  await t.test("the v1 contract answers the same payloads in legacy and in workspaces", () => {
    assert.deepEqual(workspacesAnswers, legacyAnswers);
    assert.deepEqual(
      legacyAnswers.map(([label, status]) => `${label}: ${status}`),
      [
        "list searches empty: 200",
        "notifications empty: 200",
        "create search: 201",
        "create duplicate: 409",
        "create without alerts flag: 400",
        "create second search: 201",
        "rename: 200",
        "change query to a duplicate: 409",
        "enable alerts: 200",
        "patch nothing: 400",
        "patch missing search: 404",
        "patch someone else's search: 403",
        "delete someone else's search: 403",
        "list searches after evaluation: 200",
        "notifications: 200",
        "unread count: 200",
        "search by notification: 200",
        "search by someone else's notification: 200",
        "mark search seen: 200",
        "mark one read: 200",
        "unread only: 200",
        "mark nothing: 400",
        "mark all read: 200",
        "notifications second page: 200",
        "delete search: 204",
        "list searches after delete: 200",
        "mark deleted search seen: 404",
        "restore search: 200",
        "delete search again: 204",
        "restore after the window: 409",
        "list searches at the end: 200",
      ],
    );
    const byLabel = new Map(legacyAnswers.map(([label, , body]) => [label, body as Record<string, any>]));
    assert.equal(byLabel.get("create search")!.query, "q=computadores", "the stored query is canonical");
    assert.equal(byLabel.get("create duplicate")!.error.details[0].existingId, byLabel.get("create search")!.id);
    const evaluated = byLabel.get("list searches after evaluation")!.data;
    assert.deepEqual(
      evaluated.map((item: any) => [item.name, item.newMatchesCount]).sort(),
      [["Computadores e periféricos", 3], ["Notebooks", 0]],
    );
    const feed = byLabel.get("notifications")!;
    assert.deepEqual(feed.data.map((item: any) => item.type), ["saved_search_new_matches", "tender_deadline_changed"]);
    assert.equal(feed.unreadCount, 2, "the alert of the job and the collection's notification without a workspace");
    assert.deepEqual(feed.data[0].tenderIds, matching);
    assert.equal(feed.data[0].matchCount, 3);
    assert.deepEqual(byLabel.get("unread count"), { unreadCount: 2 });
    assert.deepEqual(byLabel.get("search by notification")!.data.map((item: any) => item.id).sort(), matching);
    assert.equal(byLabel.get("search by notification")!.meta.notification.savedSearchName, "Computadores e periféricos");
    assert.deepEqual(byLabel.get("search by someone else's notification")!.data, [], "another account's snapshot reads as missing");
    assert.equal(byLabel.get("mark search seen")!.newMatchesCount, 0);
    assert.deepEqual(byLabel.get("mark one read"), { unreadCount: 1 }, "someone else's id in the list changes nothing");
    assert.deepEqual(byLabel.get("unread only")!.data.map((item: any) => item.type), ["tender_deadline_changed"]);
    assert.deepEqual(byLabel.get("mark all read"), { unreadCount: 0 });
    assert.equal(byLabel.get("notifications second page")!.pagination.total, 2);
    assert.deepEqual(byLabel.get("list searches after delete")!.data.map((item: any) => item.name), ["Notebooks"]);
    assert.equal(byLabel.get("restore search")!.newMatchesCount, 0);
    assert.equal(byLabel.get("restore after the window")!.error.details[0].issue, "restore_expired");
  });

  await t.test("stored rows hold the same fields in both modes; in workspaces they carry the default workspace", () => {
    const [searches, notifications] = workspacesRows as [any[], any[]];
    assert.ok(searches.length === 2 && searches.every((row) => row.workspace_id === workspaceId));
    assert.deepEqual(
      notifications.map((row) => [row.type, row.workspace_id, row.dedupe_prefix]),
      [
        ["saved_search_new_matches", workspaceId, "saved-search"],
        ["tender_deadline_changed", null, "tender"],
      ],
      "the alert follows its saved search; what the collection created keeps no workspace and stayed in the feed",
    );
    const comparable = (rows: unknown[][]) => rows.map((table) => table.map((row: any) => ({ ...row, workspace_id: null })));
    assert.deepEqual(comparable(workspacesRows), comparable(legacyRows));
  });

  await t.test("the subscription gate answers 402 before the workspace is resolved", async () => {
    assert.deepEqual(deniedInLegacy, Array.from({ length: 5 }, () => [402, "SUBSCRIPTION_REQUIRED"]));
    assert.deepEqual(deniedInWorkspaces, deniedInLegacy);
    assert.deepEqual(await storedSearches(unsubscribed.userId), []);
  });

  await t.test("the trial notice goes to the default workspace in workspaces and shows in both feeds", async () => {
    const workspacesTrial = await login("d3-trial-workspaces@example.test", "trial ending");
    await createDefaultWorkspace(workspacesTrial.userId);
    assert.equal(await createTrialEndingNotifications(), 1, "the legacy notice is not repeated");
    assert.equal(await createTrialEndingNotifications(), 0);
    const stored = await owner.query(
      "select user_id, workspace_id, dedupe_key from notifications where type = 'trial_ending' order by created_at",
    );
    assert.deepEqual(stored.rows, [
      { user_id: legacyTrial.userId, workspace_id: null, dedupe_key: "account:trial-ending" },
      { user_id: workspacesTrial.userId, workspace_id: defaultWorkspaceId(workspacesTrial.userId), dedupe_key: "account:trial-ending" },
    ]);
    const normalize = normalizer();
    const feeds = await Promise.all(
      [legacyTrial, workspacesTrial].map(async ({ cookie }) => {
        const feed = await json(request("/v1/me/notifications", {}, cookie));
        return normalize({ ...feed, data: feed.data.map((item: any) => ({ ...item, id: "<id>", change: { ...item.change, to: "<varies>" } })) });
      }),
    );
    assert.equal((feeds[0] as any).data[0].type, "trial_ending");
    assert.deepEqual(feeds[1], feeds[0]);
  });

  await t.test("a tender change reaches the feed of whoever monitors it in workspaces", async () => {
    const saved = await send("PUT", `/v1/me/saved-tenders/${monitoredTender}`, workspacesUser.cookie, { monitored: true });
    assert.equal(saved.status, 200);
    await upsertPublications(
      [publication(5, { dataEncerramentoProposta: "2099-11-05T17:00:00", dataAtualizacao: "2026-09-24T10:00:00" })],
      new Date(),
    );
    const feed = await json(request("/v1/me/notifications?unreadOnly=true", {}, workspacesUser.cookie));
    assert.deepEqual(feed.data.map((item: any) => [item.type, item.tender.id]), [["tender_deadline_changed", monitoredTender]]);
    assert.deepEqual(await json(send("POST", "/v1/me/notifications/read", workspacesUser.cookie, { ids: [feed.data[0].id] })), { unreadCount: 0 });
  });

  await t.test("a cycle that crosses the cutover is discarded and the next one alerts in the new model", async () => {
    await setState("legacy", false);
    const crossing = await login("d3-crossing@example.test");
    await createDefaultWorkspace(crossing.userId);
    const search = await json(send("POST", "/v1/me/saved-searches", crossing.cookie, { name: "Computadores", query: "q=computadores", alertsEnabled: true }));
    await sleep(5);
    await owner.query("update tenders set created_at = $1 where id = any($2::text[])", [new Date(), matching]);
    await sleep(5);
    let cycle: Promise<void> | undefined;
    await cutToWorkspaces(crossing.userId, {
      // The cycle reads `legacy`, then waits for the lock this transaction holds while it switches the mode.
      afterLock: async () => {
        cycle = evaluateSavedSearchNotifications(new Date());
        await sleep(300);
      },
    });
    await cycle;
    assert.deepEqual(await storedNotifications(crossing.userId), [], "nothing written by the cycle that read legacy");
    assert.equal((await storedSearches(crossing.userId))[0].new_matches_count, 0);

    await evaluateSavedSearchNotifications(new Date());
    assert.deepEqual(
      (await storedNotifications(crossing.userId)).map((row) => [row.type, row.match_count, row.workspace_id]),
      [["saved_search_new_matches", 3, defaultWorkspaceId(crossing.userId)]],
    );
    const feed = await json(request("/v1/me/notifications", {}, crossing.cookie));
    assert.equal(feed.data[0].savedSearch.id, search.id);
    assert.equal(feed.unreadCount, 1);
  });

  const concurrent = await login("d3-concurrent@example.test");
  const concurrentWorkspace = defaultWorkspaceId(concurrent.userId);
  await createDefaultWorkspace(concurrent.userId);

  await t.test("cutover under concurrent saved-search creations: rows before the switch are assigned, rows after carry the workspace", async () => {
    await setState("legacy", false);
    const responses = Array.from({ length: 30 }, (_, index) =>
      sleep(index * 15).then(async () => {
        const response = await send("POST", "/v1/me/saved-searches", concurrent.cookie, {
          name: `Busca ${String(index).padStart(2, "0")}`,
          query: `q=termo${index}`,
          alertsEnabled: index % 2 === 0,
        });
        return { name: `Busca ${String(index).padStart(2, "0")}`, status: response.status, body: (await response.json()) as any };
      }),
    );
    await sleep(120);
    const assigned = await cutToWorkspaces(concurrent.userId, { holdMs: 200 });
    const results = await Promise.all(responses);

    assert.ok(results.every(({ status }) => status === 201 || status === 503), JSON.stringify(results.map(({ status }) => status)));
    const refused = results.filter(({ status }) => status === 503);
    assert.ok(refused.length > 0, "requests during the switch answer 503");
    assert.ok(refused.every(({ body }) => body.error.code === "MAINTENANCE_IN_PROGRESS"));
    const accepted = results.filter(({ status }) => status === 201).map(({ name }) => name).sort();

    const rows = await storedSearches(concurrent.userId);
    assert.deepEqual(rows.map((row) => row.name).sort(), accepted, "one row per accepted creation, none for a refused one");
    assert.ok(assigned.searches > 0, "some creations landed in legacy before the switch");
    assert.ok(assigned.searches < accepted.length, "creations after the switch were written by the workspaces path");
    assert.ok(rows.every((row) => row.workspace_id === concurrentWorkspace), "no legacy row after the switch");
    const listed = await json(request("/v1/me/saved-searches", {}, concurrent.cookie));
    assert.deepEqual(listed.data.map((item: any) => item.name).sort(), accepted);
  });

  await t.test("cutover under concurrent mark-as-read: every accepted request reads its notification, none is lost", async () => {
    await setState("legacy", false);
    const ids = Array.from({ length: 30 }, () => randomUUID());
    for (const [index, id] of ids.entries()) {
      await owner.query(
        "insert into notifications (id, user_id, type, dedupe_key, tender_id, tender_title) values ($1, $2, 'tender_status_changed', $3, $4, 'TEST DATA')",
        [id, concurrent.userId, `test:read:${index}`, tenderIdOf(1)],
      );
    }
    const responses = ids.map((id, index) =>
      sleep(index * 15).then(async () => ({ id, status: (await send("POST", "/v1/me/notifications/read", concurrent.cookie, { ids: [id] })).status })),
    );
    await sleep(120);
    const assigned = await cutToWorkspaces(concurrent.userId, { holdMs: 200 });
    const results = await Promise.all(responses);

    assert.ok(results.every(({ status }) => status === 200 || status === 503), JSON.stringify(results.map(({ status }) => status)));
    const refused = results.filter(({ status }) => status === 503).map(({ id }) => id).sort();
    assert.ok(refused.length > 0 && refused.length < ids.length, "some requests met the switch, some ran on each side of it");
    assert.equal(assigned.notifications, ids.length, "the delta assigned every notification, read or not");
    const stored = await owner.query("select id, read_at is not null as read, workspace_id from notifications where user_id = $1", [concurrent.userId]);
    assert.equal(stored.rows.length, ids.length);
    assert.ok(stored.rows.every((row) => row.workspace_id === concurrentWorkspace));
    assert.deepEqual(stored.rows.filter((row) => !row.read).map((row) => row.id).sort(), refused, "unread = exactly the refused requests");
    const feed = await json(request("/v1/me/notifications?unreadOnly=true&pageSize=50", {}, concurrent.cookie));
    assert.equal(feed.unreadCount, refused.length);
    assert.deepEqual(feed.data.map((item: any) => item.id).sort(), refused);
  });

  await t.test("paused writes: mutations answer 503 and write nothing; reads still answer 200", async () => {
    const [search] = (await json(request("/v1/me/saved-searches", {}, concurrent.cookie))).data;
    const [unread] = (await json(request("/v1/me/notifications?unreadOnly=true", {}, concurrent.cookie))).data;
    for (const mode of ["workspaces", "legacy"] as const) {
      await setState(mode, false);
      const before = [await storedSearches(concurrent.userId), await storedNotifications(concurrent.userId)];
      await setState(mode, true);
      const refused = await send("POST", "/v1/me/saved-searches", concurrent.cookie, { name: "Na pausa", query: "q=pausa", alertsEnabled: true });
      assert.equal(refused.status, 503);
      assert.equal(refused.headers.get("retry-after"), "60");
      assert.equal(((await refused.json()) as any).error.code, "MAINTENANCE_IN_PROGRESS");
      const mutations = [
        send("PATCH", `/v1/me/saved-searches/${search.id}`, concurrent.cookie, { name: "Na pausa" }),
        send("POST", `/v1/me/saved-searches/${search.id}/seen`, concurrent.cookie),
        send("DELETE", `/v1/me/saved-searches/${search.id}`, concurrent.cookie),
        send("POST", `/v1/me/saved-searches/${search.id}/restore`, concurrent.cookie),
        send("POST", "/v1/me/notifications/read", concurrent.cookie, { ids: [unread.id] }),
        send("POST", "/v1/me/notifications/read", concurrent.cookie, { all: true }),
      ];
      for (const mutation of mutations) assert.equal((await mutation).status, 503);
      assert.deepEqual([await storedSearches(concurrent.userId), await storedNotifications(concurrent.userId)], before);
      const reads = [
        request("/v1/me/saved-searches", {}, concurrent.cookie),
        request("/v1/me/notifications", {}, concurrent.cookie),
        request("/v1/me/notifications/unread-count", {}, concurrent.cookie),
        request(`/v1/tenders/search?notification=${unread.id}&facets=false`, {}, concurrent.cookie),
      ];
      for (const read of reads) assert.equal((await read).status, 200);
    }
    await setState("workspaces", false);
  });

  await t.test("rows written in workspaces stay readable and writable by legacy after the flag is turned off", async () => {
    const read = () =>
      Promise.all([
        json(request("/v1/me/saved-searches", {}, workspacesUser.cookie)),
        json(request("/v1/me/notifications", {}, workspacesUser.cookie)),
        json(request("/v1/me/notifications/unread-count", {}, workspacesUser.cookie)),
      ]);
    const inWorkspaces = await read();
    assert.equal(inWorkspaces[0].data.length, 1);
    assert.equal(inWorkspaces[1].pagination.total, 3);
    const alert = inWorkspaces[1].data.find((item: any) => item.type === "saved_search_new_matches");

    // No reverse copy for the two tables: user_id and the legacy dedupe key are intact until W4.
    await setState("legacy", false);
    assert.deepEqual(await read(), inWorkspaces);
    assert.equal((await json(request(`/v1/tenders/search?notification=${alert.id}&facets=false`, {}, workspacesUser.cookie))).data.length, 3);

    const [search] = inWorkspaces[0].data;
    const renamed = await json(send("PATCH", `/v1/me/saved-searches/${search.id}`, workspacesUser.cookie, { name: "Depois da desvirada" }));
    assert.equal(renamed.name, "Depois da desvirada");
    assert.equal(renamed.lastCheckedAt, search.lastCheckedAt, "the checkpoint written in workspaces is kept");
    const duplicate = await send("POST", "/v1/me/saved-searches", workspacesUser.cookie, { name: "Duplicada", query: search.query, alertsEnabled: false });
    assert.equal(duplicate.status, 409, "the legacy uniqueness sees the row written in workspaces");
    assert.equal((await send("POST", "/v1/me/saved-searches", workspacesUser.cookie, { name: "Criada no legado", query: "q=legado", alertsEnabled: false })).status, 201);
    await collected(workspacesUser.userId, tenderIdOf(4));
    assert.deepEqual(await json(send("POST", "/v1/me/notifications/read", workspacesUser.cookie, { all: true })), { unreadCount: 0 });
    assert.deepEqual(
      (await storedSearches(workspacesUser.userId)).filter((row) => !row.deleted).map((row) => [row.name, row.workspace_id]),
      [["Depois da desvirada", workspaceId], ["Criada no legado", null]],
      "legacy keeps the workspace on rows it updates and writes new rows without one",
    );
    const inLegacy = await read();

    const assigned = await cutToWorkspaces(workspacesUser.userId);
    assert.equal(assigned.searches, 1, "the next cutover assigns the search created in legacy");
    assert.ok(assigned.notifications >= 2, "and the notifications that were born without a workspace");
    assert.deepEqual(await read(), inLegacy);
    assert.equal(inLegacy[0].data.length, 2);
    assert.equal(inLegacy[1].pagination.total, 4);
  });
});
