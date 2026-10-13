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
      (/At$/.test(key) && typeof entry === "string") || key === "requestId" || key === "tookMs"
        ? "<varies>"
        : normalize(entry),
    ]),
  );
};

// Opt-in: creates and drops its own database next to PNCP_TEST_DATABASE_URL, so the cutover flag is its own.
test("v1 profile, fit and international preference in legacy and workspaces modes", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  const databaseName = `licita_ws_d1_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
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
  process.env.SESSION_SECRET = "workspace-d1-integration-secret-at-least-32-characters";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.AI_FIT_LEXICAL_GATE = "shadow";
  for (const name of ["RATE_LIMIT_AUTH_PER_MINUTE", "RATE_LIMIT_USER_PER_MINUTE", "RATE_LIMIT_WRITE_PER_MINUTE", "RATE_LIMIT_AI_PER_MINUTE"]) {
    process.env[name] = "10000";
  }
  for (const name of ["BILLING_MONTHLY_BRL", "RESEND_API_KEY", "JEV_API_KEY", "OPENAI_API_KEY"]) delete process.env[name];

  const { db, pool, companyProfilesTable, subscriptionsTable, usersTable, workspaceProfilesTable } = await import(
    "@workspace/db"
  );
  const { default: app } = await import("../app");
  const { upsertPublications } = await import("../ingest/upsert-tenders");
  const { withCutoverGate } = await import("./cutover-gate");
  const { createWorkspace, defaultWorkspaceId } = await import("./workspace-service");
  const { companyProfileToWorkspaceProfile, workspaceProfileToCompanyProfile } = await import(
    "./workspace-profile-service"
  );

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await pool.end();
    await owner.end();
    await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = $1", [databaseName]);
    await admin.query(`drop database if exists "${databaseName}"`);
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
  const login = async (email: string): Promise<{ cookie: string; userId: string }> => {
    const response = await request("/v1/auth/dev-login", {
      method: "POST",
      headers: csrf,
      body: JSON.stringify({ email, name: "TEST USER" }),
    });
    assert.equal(response.status, 204);
    const cookie = response.headers.get("set-cookie")!.split(";", 1)[0]!;
    const session = await request("/v1/auth/session", {}, cookie);
    const userId = ((await session.json()) as { user: { id: string } }).user.id;
    await db
      .insert(subscriptionsTable)
      .values({ userId, status: "active", currentPeriodEnd: new Date("2099-01-01T00:00:00.000Z") });
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
  const tenderId = "00394460000141-1-000001-2026";
  const otherTenderId = "00394460000141-1-000002-2026";
  await owner.query(
    `insert into cultural_opportunities
       (id, installation_id, external_id, title, organization_name, state, status, program, search_text, raw_payload, fetched_at, scope)
     values ('intl-opportunity', 'br', 'intl-1', 'TEST DATA Chamada de computadores', 'TEST DATA Fundo', null, 'open',
       'audiovisual', 'test data chamada computadores suporte técnico', '{}', now(), 'international')`,
  );

  const profile = {
    description: "Fornecemos equipamentos de informática e suporte técnico corporativo.",
    offerings: ["computadores", "suporte técnico"],
    exclusions: [],
    selectedCategories: ["ti-telecom"],
    selectedKeywords: ["servidor rack"],
    excludedKeywords: ["impressora"],
    coverage: {
      scope: "custom",
      mode: "strict",
      acceptsRemote: false,
      regions: ["southeast"],
      states: ["SP"],
      municipalities: [{ ibgeCode: "3509502", name: "Campinas", state: "SP" }],
      radius: { center: { ibgeCode: "3509502", name: "Campinas", state: "SP" }, km: 100 },
    },
    valueRange: { min: null, max: 1000 },
    size: "other",
  };
  const put = (cookie: string, body: unknown) =>
    request("/v1/me/company-profile", { method: "PUT", headers: csrf, body: JSON.stringify(body) }, cookie);
  const fit = (cookie: string, id: string) => request(`/v1/me/fit?tenderIds=${encodeURIComponent(id)}`, {}, cookie);

  /** The v1 contract of the profile, fit and international preference, as the UI calls it. */
  const contract = async (cookie: string, beforeDelete: () => Promise<void>) => {
    const answers: Array<[string, number, unknown]> = [];
    const record = async (label: string, response: Promise<Response>) => {
      const result = await response;
      answers.push([label, result.status, result.status === 204 ? null : normalize(await result.json())]);
    };
    await record("get empty profile", request("/v1/me/company-profile", {}, cookie));
    await record("put invalid profile", put(cookie, { ...profile, offerings: ["Solução", "solucao"] }));
    await record("put profile", put(cookie, profile));
    await record("get profile", request("/v1/me/company-profile", {}, cookie));
    await record("region preview", request("/v1/me/company-profile/region-preview", {}, cookie));
    await record("search my region", request("/v1/tenders/search?myRegion=true&facets=false", {}, cookie));
    await record("fit out of coverage", fit(cookie, tenderId));
    await record("fit cached", fit(cookie, tenderId));
    await record("put platforms only", put(cookie, { ...profile, registeredPlatforms: ["sicaf", "licitanet"] }));
    await record(
      "put national",
      put(cookie, { ...profile, registeredPlatforms: ["sicaf", "licitanet"], coverage: { scope: "national", mode: "strict", acceptsRemote: false } }),
    );
    await record("fit queued", fit(cookie, tenderId));
    await record("get preferences", request("/v1/me/recommendation-preferences", {}, cookie));
    await record(
      "put preferences",
      request(
        "/v1/me/recommendation-preferences",
        { method: "PUT", headers: csrf, body: JSON.stringify({ personalizationEnabled: true, showInternationalOpportunities: true }) },
        cookie,
      ),
    );
    await record("get preferences after", request("/v1/me/recommendation-preferences", {}, cookie));
    await record("international opportunity", request("/v1/opportunities/intl-opportunity", {}, cookie));
    await beforeDelete();
    await record("delete profile", request("/v1/me/company-profile", { method: "DELETE", headers: csrf }, cookie));
    await record("get deleted profile", request("/v1/me/company-profile", {}, cookie));
    await record("fit without profile", fit(cookie, tenderId));
    return answers;
  };

  const legacyUser = await login("d1-legacy@example.test");
  const legacyAnswers = await contract(legacyUser.cookie, async () => {
    const jobs = await owner.query("select dedupe_key, workspace_id from ai_jobs where user_id = $1", [legacyUser.userId]);
    assert.equal(jobs.rows.length, 1);
    assert.equal(jobs.rows[0].workspace_id, null);
    assert.match(jobs.rows[0].dedupe_key, new RegExp(`^fit:${legacyUser.userId}:2:${tenderId}:`));
    const fits = await owner.query("select workspace_id from company_tender_fits where user_id = $1", [legacyUser.userId]);
    assert.deepEqual(fits.rows, [{ workspace_id: null }]);
    assert.equal((await owner.query("select count(*)::int as count from workspace_profiles")).rows[0].count, 0);
  });

  const workspacesUser = await login("d1-workspaces@example.test");
  const workspaceId = defaultWorkspaceId(workspacesUser.userId);
  await createDefaultWorkspace(workspacesUser.userId);
  await setState("workspaces", false);
  const workspacesAnswers = await contract(workspacesUser.cookie, async () => {
    const jobs = await owner.query("select dedupe_key, workspace_id from ai_jobs where user_id = $1", [workspacesUser.userId]);
    assert.equal(jobs.rows.length, 1);
    assert.equal(jobs.rows[0].workspace_id, workspaceId);
    assert.match(jobs.rows[0].dedupe_key, new RegExp(`^fit:${workspacesUser.userId}:2:${tenderId}:`), "legacy dedupe key until W4");
    const fits = await owner.query("select workspace_id from company_tender_fits where user_id = $1", [workspacesUser.userId]);
    assert.deepEqual(fits.rows, [{ workspace_id: workspaceId }]);
    assert.equal(
      (await owner.query("select count(*)::int as count from company_profiles where user_id = $1", [workspacesUser.userId])).rows[0].count,
      0,
    );
    const stored = await owner.query(
      `select p.revision, p.profile_version, w.onboarding_status, w.show_international_opportunities, u.show_international_opportunities as legacy_international
       from workspace_profiles p join workspaces w on w.id = p.workspace_id join users u on u.id = w.owner_user_id
       where p.workspace_id = $1`,
      [workspaceId],
    );
    assert.deepEqual(stored.rows[0], {
      revision: 3,
      profile_version: 2,
      onboarding_status: "complete",
      show_international_opportunities: true,
      legacy_international: false,
    });
    const signals = await owner.query("select count(*)::int as count from workspace_profile_signals where workspace_id = $1", [workspaceId]);
    assert.ok(signals.rows[0].count > 0);
  });

  await t.test("the v1 contract answers the same payloads in legacy and in workspaces", () => {
    assert.deepEqual(workspacesAnswers, legacyAnswers);
    const statuses = legacyAnswers.map(([label, status]) => `${label}: ${status}`);
    assert.deepEqual(statuses, [
      "get empty profile: 200",
      "put invalid profile: 400",
      "put profile: 200",
      "get profile: 200",
      "region preview: 200",
      "search my region: 200",
      "fit out of coverage: 200",
      "fit cached: 200",
      "put platforms only: 200",
      "put national: 200",
      "fit queued: 200",
      "get preferences: 200",
      "put preferences: 200",
      "get preferences after: 200",
      "international opportunity: 200",
      "delete profile: 204",
      "get deleted profile: 200",
      "fit without profile: 200",
    ]);
    const byLabel = new Map(legacyAnswers.map(([label, , body]) => [label, body as Record<string, any>]));
    assert.equal(byLabel.get("put platforms only")!.profile.version, 1, "platforms keep the version");
    assert.equal(byLabel.get("put national")!.profile.version, 2);
    assert.equal(byLabel.get("fit out of coverage")!.results[tenderId].status, "filtered");
    assert.equal(byLabel.get("fit queued")!.results[tenderId].status, "pending");
    assert.equal(byLabel.get("get preferences after")!.showInternationalOpportunities, true);
    assert.ok(byLabel.get("international opportunity")!.profileMatch, "the international opt-in lets the profile match");
  });

  await t.test("after the delete in workspaces, the workspace profile, signals and fits are gone", async () => {
    const left = await owner.query(
      `select
         (select count(*)::int from workspace_profiles where workspace_id = $1) as profiles,
         (select count(*)::int from workspace_profile_signals where workspace_id = $1) as signals,
         (select count(*)::int from company_tender_fits where workspace_id = $1) as fits,
         (select onboarding_status from workspaces where id = $1) as onboarding`,
      [workspaceId],
    );
    assert.deepEqual(left.rows[0], { profiles: 0, signals: 0, fits: 0, onboarding: "not_started" });
  });

  const concurrent = await login("d1-concurrent@example.test");
  const concurrentWorkspace = defaultWorkspaceId(concurrent.userId);
  const national = { ...profile, coverage: { scope: "national", mode: "strict", acceptsRemote: false } };
  const describe = (index: number) => ({ ...national, description: `Fornecemos computadores e suporte técnico, versão ${index}.` });

  await t.test("cutover under concurrent profile saves: no legacy write after the switch, versions continue", async () => {
    await setState("legacy", false);
    await createDefaultWorkspace(concurrent.userId);
    const responses = Array.from({ length: 30 }, (_, index) =>
      sleep(index * 15).then(async () => {
        const response = await put(concurrent.cookie, describe(index));
        return { status: response.status, body: (await response.json()) as any };
      }),
    );
    await sleep(120);
    const cutter = await owner.connect();
    let switchedAt: Date;
    try {
      await cutter.query("begin");
      await cutter.query("set local lock_timeout = '5s'");
      await cutter.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [LOCK_KEY]);
      const [legacyRow] = await drizzle(cutter)
        .select()
        .from(companyProfilesTable)
        .where(eq(companyProfilesTable.userId, concurrent.userId));
      assert.ok(legacyRow, "some saves landed in legacy before the switch");
      const converted = companyProfileToWorkspaceProfile(legacyRow);
      await drizzle(cutter)
        .insert(workspaceProfilesTable)
        .values({ workspaceId: concurrentWorkspace, ...converted })
        .onConflictDoUpdate({ target: workspaceProfilesTable.workspaceId, set: converted });
      const switched = await cutter.query(
        "insert into workspace_cutover_events (mode, writes_paused, actor, reason) values ('workspaces', false, 'teste', 'cut: TEST') returning created_at",
      );
      switchedAt = switched.rows[0].created_at;
      await sleep(200);
      await cutter.query("commit");
    } finally {
      cutter.release();
    }
    const results = await Promise.all(responses);
    assert.ok(results.every(({ status }) => status === 200 || status === 503), JSON.stringify(results.map(({ status }) => status)));
    const refused = results.filter(({ status }) => status === 503);
    assert.ok(refused.length > 0, "requests during the switch answer 503");
    assert.ok(refused.every(({ body }) => body.error.code === "MAINTENANCE_IN_PROGRESS"));
    const versions = results
      .filter(({ status }) => status === 200)
      .map(({ body }) => body.profile.version as number)
      .sort((a, b) => a - b);
    assert.deepEqual(versions, versions.map((_, index) => index + 1), "one version per save, none written twice");

    const legacy = await owner.query("select version, description, updated_at from company_profiles where user_id = $1", [concurrent.userId]);
    const workspace = await owner.query("select profile_version, revision from workspace_profiles where workspace_id = $1", [concurrentWorkspace]);
    assert.ok(legacy.rows[0].version < versions.length, "saves after the switch went to the workspace");
    assert.ok(legacy.rows[0].updated_at <= switchedAt!, "no legacy write after the switch");
    assert.deepEqual(workspace.rows[0], { profile_version: versions.length, revision: versions.length });
  });

  await t.test("paused writes: saves answer 503 and write nothing; reads and cached fits still answer 200", async () => {
    assert.equal((await fit(concurrent.cookie, tenderId)).status, 200);
    await setState("workspaces", true);
    const before = await owner.query("select revision from workspace_profiles where workspace_id = $1", [concurrentWorkspace]);
    const refused = await put(concurrent.cookie, describe(99));
    assert.equal(refused.status, 503);
    assert.equal(refused.headers.get("retry-after"), "60");
    assert.equal(((await refused.json()) as any).error.code, "MAINTENANCE_IN_PROGRESS");
    const preferences = await request(
      "/v1/me/recommendation-preferences",
      { method: "PUT", headers: csrf, body: JSON.stringify({ personalizationEnabled: true, showInternationalOpportunities: true }) },
      concurrent.cookie,
    );
    assert.equal(preferences.status, 503);
    assert.equal((await request("/v1/me/company-profile", { method: "DELETE", headers: csrf }, concurrent.cookie)).status, 503);
    const after = await owner.query("select revision from workspace_profiles where workspace_id = $1", [concurrentWorkspace]);
    assert.deepEqual(after.rows, before.rows);
    assert.equal((await request("/v1/me/company-profile", {}, concurrent.cookie)).status, 200);
    assert.equal((await request("/v1/me/recommendation-preferences", {}, concurrent.cookie)).status, 200);
    assert.equal((await fit(concurrent.cookie, tenderId)).status, 200, "a cached fit writes nothing");
    assert.equal((await fit(concurrent.cookie, otherTenderId)).status, 503, "a new fit would write: it waits for the pause");
    await setState("workspaces", false);
  });

  await t.test("round trip: profile saved in workspaces, reverse copy, legacy answers the same", async () => {
    assert.equal(
      (
        await request(
          "/v1/me/recommendation-preferences",
          { method: "PUT", headers: csrf, body: JSON.stringify({ personalizationEnabled: true, showInternationalOpportunities: true }) },
          concurrent.cookie,
        )
      ).status,
      200,
    );
    const inWorkspaces = await Promise.all([
      request("/v1/me/company-profile", {}, concurrent.cookie).then((response) => response.json()),
      fit(concurrent.cookie, tenderId).then((response) => response.json()),
      request("/v1/me/recommendation-preferences", {}, concurrent.cookie).then((response) => response.json()),
    ]);

    const cutter = await owner.connect();
    try {
      await cutter.query("begin");
      await cutter.query("set local lock_timeout = '5s'");
      await cutter.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [LOCK_KEY]);
      const [workspaceRow] = await drizzle(cutter)
        .select()
        .from(workspaceProfilesTable)
        .where(eq(workspaceProfilesTable.workspaceId, concurrentWorkspace));
      const legacyRow = workspaceProfileToCompanyProfile(concurrent.userId, workspaceRow!);
      const { userId: _userId, ...columns } = legacyRow;
      await drizzle(cutter)
        .insert(companyProfilesTable)
        .values(legacyRow)
        .onConflictDoUpdate({ target: companyProfilesTable.userId, set: columns });
      await cutter.query(
        `update users u set show_international_opportunities = w.show_international_opportunities
         from workspaces w where w.id = $1 and u.id = w.owner_user_id`,
        [concurrentWorkspace],
      );
      await cutter.query(
        "insert into workspace_cutover_events (mode, writes_paused, actor, reason) values ('legacy', false, 'teste', 'rollback: TEST')",
      );
      await cutter.query("commit");
      const [copied] = await drizzle(cutter)
        .select()
        .from(companyProfilesTable)
        .where(eq(companyProfilesTable.userId, concurrent.userId));
      assert.deepEqual(companyProfileToWorkspaceProfile(copied!).answers, workspaceRow!.answers, "legacy -> workspace -> legacy");
    } finally {
      cutter.release();
    }

    const inLegacy = await Promise.all([
      request("/v1/me/company-profile", {}, concurrent.cookie).then((response) => response.json()),
      fit(concurrent.cookie, tenderId).then((response) => response.json()),
      request("/v1/me/recommendation-preferences", {}, concurrent.cookie).then((response) => response.json()),
    ]);
    assert.deepEqual(inLegacy, inWorkspaces);
    const [user] = await db
      .select({ international: usersTable.showInternationalOpportunities })
      .from(usersTable)
      .where(eq(usersTable.id, concurrent.userId));
    assert.equal(user!.international, true);
  });
});
