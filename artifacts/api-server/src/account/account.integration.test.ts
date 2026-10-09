import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { EmailMessage } from "../email/resend-client";
import type { SavedTender as SavedTenderModel, SavedTenderPage as SavedTenderPageModel, AccountExport as AccountExportModel } from '@workspace/api-zod';
type JsonValue<T> = T extends Date ? string : T extends Array<infer U> ? JsonValue<U>[] : T extends object ? { [K in keyof T]: JsonValue<T[K]> } : T;
type SavedTender = JsonValue<SavedTenderModel>;
type SavedTenderPage = JsonValue<SavedTenderPageModel>;
type AccountExport = JsonValue<AccountExportModel>;

// Opt-in: uses real Postgres in an isolated schema. The public schema must have
// the application migrations applied before PNCP_TEST_DATABASE_URL is set.
test("Account API with PostgreSQL", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  const schema = `account_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.PUBLIC_APP_ORIGIN = "http://localhost:24252";
  process.env.AUTH_DEV_LOGIN = "true";
  process.env.SESSION_SECRET = "account-integration-secret-at-least-32-characters";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.RATE_LIMIT_AUTH_PER_MINUTE = "1000";
  delete process.env.BILLING_MONTHLY_BRL;
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
  delete process.env.MAIL_REPLY_TO;
  delete process.env.JEV_API_KEY;

  const {
    aiAskRequestsTable,
    aiDailyTendersTable,
    aiDailyUsageTable,
    aiFitDailyUsageTable,
    aiJobsTable,
    aiSheetDailyUsageTable,
    betaAccessGrantsTable,
    companyProfilesTable,
    companyTenderFitsTable,
    profileKeywordVocabularyTable,
    db,
    culturalOpportunitiesTable,
    emailDeliveriesTable,
    emailDeliveryNotificationsTable,
    googleTrialTombstonesTable,
    pool,
    notificationsTable,
    recommendationDismissalsTable,
    recommendationEventsTable,
    recommendationMetricsDailyTable,
    savedSearchesTable,
    savedTendersTable,
    sessionsTable,
    subscriptionsTable,
    tenderAiDocumentsTable,
    tenderAiIndexesTable,
    tenderAiPassagesTable,
    tenderAiSheetsTable,
    tendersTable,
    usersTable,
    userRecommendationsTable,
  } = await import("@workspace/db");
  const { eq, inArray } = await import("drizzle-orm");
  const { default: app } = await import("../app");
  const { ACCOUNT_EXPORT_TABLES, deleteAccount } = await import("./account-privacy-service");
  const { purgeRetainedPersonalData, REDACTED_RECIPIENT } = await import("./personal-data-retention");
  const { BillingUnavailableError } = await import("../lib/api-error");
  const { upsertGoogleUser } = await import("../auth/session-service");
  const { upsertPublications } = await import("../ingest/upsert-tenders");
  const { createDocumentAddedNotifications, createTrialEndingNotifications } = await import("./notification-service");
  const { createUnsubscribeToken } = await import("../email/unsubscribe-token");
  const { retryEmailDeliveries, runDailyEmailDigest, runImmediateEmailAlerts } = await import("../email/email-service");
  const { runSavedSearchEvaluationJob } = await import("../email/email-scheduler");
  const { rebuildInterestProfile } = await import("../recommendations/recommendation-service");

  await pool.query(`CREATE SCHEMA "${schema}"`);
  for (const table of [
    "tenders",
    "cultural_opportunities",
    "ingest_runs",
    "users",
    "google_trial_tombstones",
    "sessions",
    "saved_tenders",
    "saved_searches",
    "notifications",
    "subscriptions",
    "email_deliveries",
    "email_delivery_notifications",
    "ai_daily_usage",
    "ai_ask_requests",
    "ai_jobs",
    "tender_ai_answers",
    "tender_ai_indexes",
    "tender_ai_documents",
    "tender_ai_passages",
    "tender_ai_sheets",
    "ai_sheet_daily_usage",
    "company_profiles",
    "company_tender_fits",
    "profile_keyword_vocabulary",
    "ai_fit_daily_usage",
    "recommendation_events",
    "recommendation_dismissals",
    "recommendation_interest_profiles",
    "user_recommendations",
    "recommendation_metrics_daily",
  ]) {
    await pool.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
  }
  // Newer than the shared test database's public schema: create it from its migration, in this schema.
  await pool.query(
    readFileSync(new URL("../../../../lib/db/migrations/0018_beta_access.sql", import.meta.url), "utf8"),
  );
  await pool.query(
    readFileSync(new URL("../../../../lib/db/migrations/0026_ai_daily_tenders.sql", import.meta.url), "utf8"),
  );
  const participationColumn = await pool.query("select 1 from information_schema.columns where table_schema = $1 and table_name = 'saved_tenders' and column_name = 'stage'", [schema]);
  if (participationColumn.rowCount === 0) await pool.query(
    readFileSync(new URL('../../../../lib/db/migrations/0019_participation.sql', import.meta.url), 'utf8'),
  );
  const interestsColumn = await pool.query("select 1 from information_schema.columns where table_schema = $1 and table_name = 'recommendation_metrics_daily' and column_name = 'interests'", [schema]);
  if (interestsColumn.rowCount === 0) await pool.query(
    readFileSync(new URL('../../../../lib/db/migrations/0032_recommendation_interests.sql', import.meta.url), 'utf8'),
  );

  const server: Server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const csrf = {
    Origin: "http://localhost:24252",
    "X-Requested-With": "licita-insight",
  };
  const request = (path: string, init: RequestInit = {}, cookie?: string): Promise<Response> =>
    fetch(`${baseUrl}/api${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...init.headers,
      },
    });
  const login = async (email: string, subscribed = true): Promise<string> => {
    const response = await request("/v1/auth/dev-login", {
      method: "POST",
      headers: csrf,
      body: JSON.stringify({ email, name: "TEST USER" }),
    });
    assert.equal(response.status, 204);
    const setCookie = response.headers.get("set-cookie");
    assert.ok(setCookie);
    const cookie = setCookie.split(";", 1)[0]!;
    const session = await request("/v1/auth/session", {}, cookie);
    assert.equal(session.status, 200);
    const userId = ((await session.json()) as { user: { id: string } }).user.id;
    if (subscribed) {
      await db
        .insert(subscriptionsTable)
        .values({
          userId,
          status: "active",
          currentPeriodEnd: new Date("2099-01-01T00:00:00.000Z"),
        })
        .onConflictDoNothing();
    }
    return cookie;
  };
  const publication = (sequence: number, overrides: Record<string, unknown> = {}) => ({
    numeroControlePNCP: `00394460000141-1-${String(sequence).padStart(6, "0")}/2026`,
    objetoCompra: "Aquisição de computadores para TEST DATA",
    numeroCompra: String(sequence),
    anoCompra: 2026,
    modalidadeId: 6,
    modalidadeNome: "Pregão - Eletrônico",
    situacaoCompraNome: "Divulgada no PNCP",
    dataPublicacaoPncp: "2026-09-20T09:00:00",
    dataEncerramentoProposta: "2026-10-30T17:00:00",
    dataAtualizacao: "2026-09-23T10:00:00",
    valorTotalEstimado: 100,
    orcamentoSigilosoCodigo: 1,
    orgaoEntidade: {
      cnpj: "00394460000141",
      razaoSocial: "Órgão de teste",
    },
    unidadeOrgao: {
      ufSigla: "DF",
      municipioNome: "Brasília",
    },
    ...overrides,
  });

  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  });

  assert.equal(
    (
      await request("/v1/auth/dev-login", {
        method: "POST",
        headers: {
          Origin: "http://127.0.0.1:24252",
          "X-Requested-With": "licita-insight",
        },
        body: JSON.stringify({ email: "csrf@example.test" }),
      })
    ).status,
    403,
  );

  const userACookie = await login("user-a@example.test");
  const userBCookie = await login("user-b@example.test");

  await t.test("grants a 7-day trial, gates cultural opportunities, and prefers subscriptions", async () => {
    const cookie = await login("trial-access@example.test", false);
    const [user] = await db
      .select({
        id: usersTable.id,
        createdAt: usersTable.createdAt,
        trialEndsAt: usersTable.trialEndsAt,
      })
      .from(usersTable)
      .where(eq(usersTable.email, "trial-access@example.test"));
    assert.ok(user);
    const trialDurationMs = user.trialEndsAt.getTime() - user.createdAt.getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(trialDurationMs - sevenDaysMs) <= 1_000);

    const plan = await request("/v1/billing/plan");
    assert.equal(plan.status, 200);
    assert.deepEqual(await plan.json(), {
      monthlyBrl: null,
      trialDays: 7,
      currency: "BRL",
    });

    await db.insert(culturalOpportunitiesTable).values({
      id: "trial-cultural-opportunity",
      installationId: "br",
      externalId: "trial-1",
      title: "TEST DATA Edital de audiovisual",
      organizationName: "TEST DATA Cultura",
      state: "DF",
      status: "open",
      program: "audiovisual",
      searchText: "test data edital audiovisual",
      rawPayload: {},
      fetchedAt: new Date(),
    });

    assert.equal((await request("/v1/opportunities")).status, 401);
    assert.equal((await request("/v1/me/saved-tenders/ids", {}, cookie)).status, 200);
    assert.equal((await request("/v1/opportunities", {}, cookie)).status, 200);
    assert.equal((await request("/v1/opportunities/trial-cultural-opportunity", {}, cookie)).status, 200);
    const trialBilling = (await (await request("/v1/me/billing", {}, cookie)).json()) as { entitled: boolean; source: string; trialEndsAt: string };
    assert.equal(trialBilling.entitled, true);
    assert.equal(trialBilling.source, "trial");
    assert.equal(trialBilling.trialEndsAt, user.trialEndsAt.toISOString());

    await db
      .update(usersTable)
      .set({ trialEndsAt: new Date("2000-01-01T00:00:00.000Z") })
      .where(eq(usersTable.id, user.id));
    assert.equal((await request("/v1/me/saved-tenders/ids", {}, cookie)).status, 402);
    assert.equal((await request("/v1/opportunities", {}, cookie)).status, 402);

    await db.insert(subscriptionsTable).values({
      userId: user.id,
      status: "active",
      currentPeriodEnd: new Date("2099-01-01T00:00:00.000Z"),
    });
    const paidBilling = (await (await request("/v1/me/billing", {}, cookie)).json()) as { source: string };
    assert.equal(paidBilling.source, "subscription");
    assert.equal((await request("/v1/opportunities", {}, cookie)).status, 200);
  });

  await t.test("uses Brasília calendar days for tender and opportunity filters", async () => {
    const boundaries = [
      { sequence: 900, id: "prior", at: "2026-09-23T23:59:00-03:00" },
      { sequence: 901, id: "start", at: "2026-09-24T00:00:00-03:00" },
      { sequence: 902, id: "end", at: "2026-09-24T23:59:59.999-03:00" },
      { sequence: 903, id: "next", at: "2026-09-25T00:00:00-03:00" },
    ];
    await upsertPublications(
      boundaries.map(({ sequence, id, at }) =>
        publication(sequence, {
          objetoCompra: `TEST DATA timezone ${id}`,
          dataPublicacaoPncp: at,
          dataEncerramentoProposta: at,
        }),
      ),
      new Date("2026-09-20T12:00:00.000Z"),
    );
    await db.insert(culturalOpportunitiesTable).values(
      boundaries.map(({ id, at }) => ({
        id: `timezone-${id}`,
        installationId: "br",
        externalId: `timezone-${id}`,
        title: `TEST DATA timezone ${id}`,
        organizationName: "TEST DATA Cultura",
        state: "DF",
        registrationTo: new Date(at),
        status: "open",
        program: "audiovisual",
        searchText: `test data timezone ${id}`,
        rawPayload: {},
        fetchedAt: new Date("2026-09-20T12:00:00.000Z"),
      })),
    );

    const tenderIds = async (filter: string) => {
      const response = await request(`/v1/tenders/search?q=timezone&facets=false&pageSize=50&${filter}`);
      assert.equal(response.status, 200);
      return ((await response.json()) as { data: { id: string }[] }).data.map(({ id }) => id).sort();
    };
    const opportunityIds = async (filter: string) => {
      const response = await request(`/v1/opportunities?q=timezone&facets=false&pageSize=50&${filter}`, {}, userACookie);
      assert.equal(response.status, 200);
      return ((await response.json()) as { data: { id: string }[] }).data.map(({ id }) => id).sort();
    };

    const tenderId = (sequence: number) => `00394460000141-1-${String(sequence).padStart(6, "0")}-2026`;
    const fromDay = [tenderId(901), tenderId(902), tenderId(903)].sort();
    const throughPriorDay = [tenderId(900)];
    const throughDay = [tenderId(900), tenderId(901), tenderId(902)].sort();

    assert.deepEqual(await tenderIds("deadlineFrom=2026-09-24"), fromDay);
    assert.deepEqual(await tenderIds("deadlineTo=2026-09-23"), throughPriorDay);
    assert.deepEqual(await tenderIds("deadlineTo=2026-09-24"), throughDay);
    assert.deepEqual(await tenderIds("publishedFrom=2026-09-24"), fromDay);
    assert.deepEqual(await tenderIds("publishedTo=2026-09-23"), throughPriorDay);
    assert.deepEqual(await tenderIds("publishedTo=2026-09-24"), throughDay);

    assert.deepEqual(await opportunityIds("deadlineFrom=2026-09-24"), ["timezone-end", "timezone-next", "timezone-start"]);
    assert.deepEqual(await opportunityIds("deadlineTo=2026-09-23"), ["timezone-prior"]);
    assert.deepEqual(await opportunityIds("deadlineTo=2026-09-24"), ["timezone-end", "timezone-prior", "timezone-start"]);
  });

  await t.test("manages email preferences and public one-click unsubscribe", async () => {
    const cookie = await login("email-preferences@example.test", false);
    const session = await request("/v1/auth/session", {}, cookie);
    const userId = ((await session.json()) as { user: { id: string } }).user.id;
    await db
      .update(usersTable)
      .set({ trialEndsAt: new Date("2000-01-01T00:00:00.000Z") })
      .where(eq(usersTable.id, userId));

    const defaults = await request("/v1/me/notification-preferences", {}, cookie);
    assert.equal(defaults.status, 200);
    assert.deepEqual(await defaults.json(), {
      email: { digest: "daily", immediateCritical: true },
      profileAlerts: true,
      emailAddress: "email-preferences@example.test",
      updatedAt: null,
    });
    assert.equal(
      (
        await request(
          "/v1/me/notification-preferences",
          {
            method: "PUT",
            body: JSON.stringify({ email: { digest: "off" } }),
          },
          cookie,
        )
      ).status,
      403,
    );

    const partial = await request(
      "/v1/me/notification-preferences",
      {
        method: "PUT",
        headers: csrf,
        body: JSON.stringify({ email: { digest: "off" } }),
      },
      cookie,
    );
    assert.equal(partial.status, 200);
    const partialBody = (await partial.json()) as {
      email: { digest: string; immediateCritical: boolean };
      updatedAt: string | null;
    };
    assert.deepEqual(partialBody.email, {
      digest: "off",
      immediateCritical: true,
    });
    const profileAlerts = await request(
      "/v1/me/notification-preferences",
      {
        method: "PUT",
        headers: csrf,
        body: JSON.stringify({ profileAlerts: false }),
      },
      cookie,
    );
    assert.equal(profileAlerts.status, 200);
    assert.equal(((await profileAlerts.json()) as { profileAlerts: boolean }).profileAlerts, false);
    assert.ok(partialBody.updatedAt);

    const [user] = await db.select({ tokenId: usersTable.emailUnsubscribeId }).from(usersTable).where(eq(usersTable.id, userId));
    const token = createUnsubscribeToken(user!.tokenId);
    const invalid = await request("/v1/email/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ token: `${token}x`, scope: "all" }),
    });
    assert.equal(invalid.status, 400);

    const immediate = await request("/v1/email/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ token, scope: "immediate" }),
    });
    assert.equal(immediate.status, 200);
    assert.deepEqual(await immediate.json(), {
      scope: "immediate",
      email: { digest: "off", immediateCritical: false },
    });

    await request(
      "/v1/me/notification-preferences",
      {
        method: "PUT",
        headers: csrf,
        body: JSON.stringify({
          email: { digest: "daily", immediateCritical: true },
        }),
      },
      cookie,
    );
    const digest = await request(`/v1/email/unsubscribe?token=${encodeURIComponent(token)}&scope=digest`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    assert.deepEqual(await digest.json(), {
      scope: "digest",
      email: { digest: "off", immediateCritical: true },
    });

    const all = await request("/v1/email/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ token, scope: "all" }),
    });
    assert.deepEqual(await all.json(), {
      scope: "all",
      email: { digest: "off", immediateCritical: false },
    });
  });

  await t.test("development entitlement bypasses paid routes only outside production", async () => {
    const cookie = await login("billing-gate@example.test", false);
    const session = await request("/v1/auth/session", {}, cookie);
    assert.equal(session.status, 200);
    const userId = ((await session.json()) as { user: { id: string } }).user.id;
    await db
      .update(usersTable)
      .set({ trialEndsAt: new Date("2000-01-01T00:00:00.000Z") })
      .where(eq(usersTable.id, userId));

    const denied = await request("/v1/me/saved-tenders/ids", {}, cookie);
    assert.equal(denied.status, 402);
    assert.equal(((await denied.json()) as { error: { code: string } }).error.code, "SUBSCRIPTION_REQUIRED");
    const participationPath = '/v1/me/saved-tenders/00394460000141-1-000123-2026';
    assert.equal((await request(participationPath, {}, cookie)).status, 402);
    assert.equal((await request(participationPath, {
      method: 'PUT', headers: csrf, body: JSON.stringify({ stage: 'participating' }),
    }, cookie)).status, 402);

    const billing = await request("/v1/me/billing", {}, cookie);
    assert.equal(billing.status, 200);
    const view = (await billing.json()) as {
      entitled: boolean;
      source: string | null;
      status: string;
    };
    assert.equal(view.entitled, false);
    assert.equal(view.source, null);
    assert.equal(view.status, "none");

    process.env.BILLING_DEV_ENTITLED = "true";
    const allowed = await request("/v1/me/saved-tenders/ids", {}, cookie);
    assert.equal(allowed.status, 200);
    const developmentBilling = (await (await request("/v1/me/billing", {}, cookie)).json()) as { entitled: boolean; source: string; status: string };
    assert.equal(developmentBilling.entitled, true);
    assert.equal(developmentBilling.source, "dev");
    assert.equal(developmentBilling.status, "none");

    process.env.NODE_ENV = "production";
    assert.equal((await request("/v1/me/saved-tenders/ids", {}, cookie)).status, 402);
    process.env.NODE_ENV = "test";
    delete process.env.BILLING_DEV_ENTITLED;

    const exportWithoutSubscription = await request("/v1/me/export", {}, cookie);
    assert.equal(exportWithoutSubscription.status, 200);
  });

  await t.test("expires and revokes sessions", async () => {
    const active = await request("/v1/auth/session", {}, userACookie);
    assert.equal(active.status, 200);

    const sessionId = userACookie.split("=", 2)[1]!;
    const { sha256 } = await import("../auth/tokens");
    await db
      .update(sessionsTable)
      .set({ expiresAt: new Date("2000-01-01T00:00:00Z") })
      .where(eq(sessionsTable.id, sha256(sessionId)));
    assert.equal((await request("/v1/auth/session", {}, userACookie)).status, 401);

    const renewedCookie = await login("user-a@example.test");
    assert.equal((await request("/v1/auth/logout", { method: "POST", headers: csrf }, renewedCookie)).status, 204);
    assert.equal((await request("/v1/auth/session", {}, renewedCookie)).status, 401);
  });

  const authenticatedCookie = await login("user-a@example.test");
  const first = publication(123);
  await upsertPublications([first], new Date("2026-09-23T13:00:00Z"));
  const tenderId = "00394460000141-1-000123-2026";

  await t.test('persists declared participation, isolates users, merges concurrent checklist patches and exports history', async () => {
    const cookie = await login('participation@example.test');
    const path = `/v1/me/saved-tenders/${tenderId}`;
    const put = (body: unknown) => request(path, { method: 'PUT', headers: csrf, body: JSON.stringify(body) }, cookie);
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, {}, cookie)).status, 404);
    assert.equal((await request(path, { method: 'PUT', body: '{}' }, cookie)).status, 403);
    const initialResponse = await put({});
    assert.equal(initialResponse.status, 200);
    const initial = await initialResponse.json() as SavedTender;
    assert.equal(initial.stage, 'analyzing');
    assert.equal(initial.participationSource, 'user');
    assert.equal(initial.history.length, 1);
    assert.equal((await request(path, {}, userBCookie)).status, 404);
    const preparing = await (await put({ stage: 'participating', protocol: 'ABC-123', nextAction: 'Separar documentos', nextActionDeadline: '2026-10-02T15:00:00Z' })).json() as SavedTender;
    assert.equal(preparing.monitored, true);
    assert.equal(preparing.history[1].from, 'analyzing');
    assert.equal(preparing.history[1].source, 'user');
    await Promise.all([
      put({ checklist: [{ key: 'site_visit', state: 'missing', note: 'Agendar visita' }] }),
      put({ checklist: [{ key: 'qualificacao_tecnica', state: 'have' }] }),
    ]);
    const persisted = await (await request(path, {}, cookie)).json() as SavedTender;
    assert.equal(persisted.checklist.length, 2);
    assert.equal(persisted.protocol, 'ABC-123');
    assert.equal(persisted.nextAction, 'Separar documentos');
    const repeated = await (await put({ stage: 'participating' })).json() as SavedTender;
    assert.equal(repeated.history.length, 2);
    assert.equal(repeated.stageAt, preparing.stageAt);
    const submitted = await (await put({ stage: 'submitted', checklist: [{ key: 'site_visit', state: 'have' }] })).json() as SavedTender;
    assert.equal(submitted.checklist.find((item) => item.key === 'site_visit')?.note, 'Agendar visita');
    assert.equal(submitted.history.length, 3);
    const filtered = await (await request('/v1/me/saved-tenders?stage=submitted&sort=deadline&upcoming=true', {}, cookie)).json() as SavedTenderPage;
    assert.equal(filtered.pagination.total, 1);
    const empty = await (await request('/v1/me/saved-tenders?stage=dismissed', {}, cookie)).json() as SavedTenderPage;
    assert.equal(empty.pagination.total, 0);
    assert.equal((await put({ history: [], participationSource: 'official' })).status, 400);
    assert.equal((await put({ checklist: [{ key: 'fake', state: 'have' }] })).status, 400);
    assert.equal((await request('/v1/me/saved-tenders?stage=fake', {}, cookie)).status, 400);
    const exported = await (await request('/v1/me/export', {}, cookie)).json() as AccountExport;
    assert.equal(exported.savedTenders[0].protocol, 'ABC-123');
    assert.equal(exported.savedTenders[0].history.length, 3);
    assert.equal(exported.savedTenders[0].participationSource, 'user');
    await put({ stage: 'awaiting_result' });
    await put({ stage: 'completed' });
    const dismissed = await (await put({ stage: 'dismissed', protocol: null, nextAction: null, nextActionDeadline: null })).json() as SavedTender;
    assert.equal(dismissed.monitored, false);
    assert.equal(dismissed.protocol, null);
    assert.equal(dismissed.history.length, 6);
    assert.equal((await request(path, { method: 'DELETE', headers: csrf }, cookie)).status, 204);
    assert.equal((await request(path, {}, cookie)).status, 404);
  });

  await t.test("enforces ask-tender authentication, entitlement, validation, and availability", async () => {
    assert.equal((await request(`/v1/tenders/${tenderId}/ask-status`)).status, 401);
    assert.equal((await request(`/v1/tenders/${tenderId}/sheet`)).status, 401);
    // Details already fetched from PNCP and still no files: a real "no documents" tender, not a pending one.
    await db.update(tendersTable).set({ detailsFetchedAt: new Date() }).where(eq(tendersTable.id, tenderId));
    const status = await request(`/v1/tenders/${tenderId}/ask-status`, {}, authenticatedCookie);
    assert.equal(status.status, 200);
    assert.equal(((await status.json()) as { index: string }).index, "no_documents");

    const expiredCookie = await login("ask-expired@example.test", false);
    const expiredSession = await request("/v1/auth/session", {}, expiredCookie);
    const expiredUserId = ((await expiredSession.json()) as { user: { id: string } }).user.id;
    await db
      .update(usersTable)
      .set({ trialEndsAt: new Date(0) })
      .where(eq(usersTable.id, expiredUserId));
    assert.equal((await request(`/v1/tenders/${tenderId}/sheet`, {}, expiredCookie)).status, 402);
    assert.equal(
      (
        await request(
          `/v1/tenders/${tenderId}/ask`,
          {
            method: "POST",
            headers: csrf,
            body: JSON.stringify({ question: "Qual o prazo?" }),
          },
          expiredCookie,
        )
      ).status,
      402,
    );

    const unavailable = await request(
      `/v1/tenders/${tenderId}/ask`,
      {
        method: "POST",
        headers: csrf,
        body: JSON.stringify({ question: "Qual o prazo?" }),
      },
      authenticatedCookie,
    );
    assert.equal(unavailable.status, 503);
    assert.equal(((await unavailable.json()) as { error: { code: string } }).error.code, "AI_UNAVAILABLE");

    const invalid = await request(
      `/v1/tenders/${tenderId}/ask`,
      {
        method: "POST",
        headers: csrf,
        body: JSON.stringify({ question: "x" }),
      },
      authenticatedCookie,
    );
    assert.equal(invalid.status, 400);

    process.env.JEV_API_KEY = "TEST KEY";
    assert.equal((await request("/v1/tenders/missing/sheet", {}, authenticatedCookie)).status, 404);
    const sheet = await request(`/v1/tenders/${tenderId}/sheet`, {}, authenticatedCookie);
    assert.equal(sheet.status, 200);
    assert.deepEqual(await sheet.json(), {
      status: "no_documents",
      fields: [],
      qualificationChecklist: [],
      summary: null,
      unreadDocuments: 0,
      documentReading: { read: 0, total: 0, unread: [] },
      model: null,
      generatedAt: null,
      registrationRequirement: null,
    });
    assert.equal(
      (
        await request(
          "/v1/tenders/missing/ask",
          {
            method: "POST",
            headers: csrf,
            body: JSON.stringify({ question: "Qual o prazo?" }),
          },
          authenticatedCookie,
        )
      ).status,
      404,
    );
    const [askUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, "user-a@example.test"));
    await db.update(tenderAiIndexesTable).set({ status: "ready" }).where(eq(tenderAiIndexesTable.tenderId, tenderId));
    await db.insert(tenderAiDocumentsTable).values({
      id: "ask-quota-document",
      tenderId,
      sourceDocumentId: "test",
      title: "TEST DATA edital.pdf",
      sourceUrl: "https://example.test/edital.pdf",
      pages: 1,
      status: "ready",
    });
    await db.insert(tenderAiPassagesTable).values({
      id: "ask-quota-passage",
      tenderId,
      documentId: "ask-quota-document",
      indexVersion: 1,
      page: 1,
      passageOrder: 0,
      text: "O prazo para envio da proposta e de tres dias.",
    });
    const { dateInSaoPaulo } = await import("../lib/sao-paulo-date");
    const quotaDay = dateInSaoPaulo(new Date());
    await db.insert(aiSheetDailyUsageTable).values({ quotaDay, used: 1 });
    process.env.AI_DAILY_SHEET_LIMIT = "1";
    const sheetLimited = await request(`/v1/tenders/${tenderId}/sheet`, {}, authenticatedCookie);
    assert.equal(sheetLimited.status, 429);
    assert.equal(((await sheetLimited.json()) as { error: { code: string } }).error.code, "AI_QUOTA_EXCEEDED");
    delete process.env.AI_DAILY_SHEET_LIMIT;
    await db
      .insert(aiDailyUsageTable)
      .values({
        userId: askUser!.id,
        quotaDay,
        used: 1,
      })
      .onConflictDoUpdate({
        target: [aiDailyUsageTable.userId, aiDailyUsageTable.quotaDay],
        set: { used: 1 },
      });
    process.env.AI_DAILY_ASK_LIMIT_PAID = "1";
    const limited = await request(
      `/v1/tenders/${tenderId}/ask`,
      {
        method: "POST",
        headers: csrf,
        body: JSON.stringify({ question: "Qual o prazo?" }),
      },
      authenticatedCookie,
    );
    assert.equal(limited.status, 429);
    assert.equal(((await limited.json()) as { error: { code: string } }).error.code, "AI_QUOTA_EXCEEDED");
    const { SHEET_FIELDS, SHEET_PROMPT_VERSION } = await import("../ai/tender-sheet-policy");
    await db.insert(tenderAiSheetsTable).values({
      id: "global-sheet-cache",
      tenderId,
      indexVersion: 1,
      requestedModel: "jev-1.13.0",
      promptVersion: SHEET_PROMPT_VERSION,
      status: "ready",
      fields: SHEET_FIELDS.map(({ id }) => ({
        id,
        status: "not_found" as const,
        answer: null,
        confidence: null,
        evidence: null,
      })),
      generatedAt: new Date("2026-09-25T12:00:00.000Z"),
    });
    const sheetUserA = await request(`/v1/tenders/${tenderId}/sheet`, {}, authenticatedCookie);
    const sheetUserB = await request(`/v1/tenders/${tenderId}/sheet`, {}, userBCookie);
    assert.equal(sheetUserA.status, 200);
    assert.equal(sheetUserB.status, 200);
    assert.deepEqual(await sheetUserB.json(), await sheetUserA.json());
    await db.update(tenderAiIndexesTable).set({ version: 2 }).where(eq(tenderAiIndexesTable.tenderId, tenderId));
    process.env.AI_DAILY_SHEET_LIMIT = "1";
    assert.equal((await request(`/v1/tenders/${tenderId}/sheet`, {}, authenticatedCookie)).status, 429);
    delete process.env.AI_DAILY_SHEET_LIMIT;
    delete process.env.AI_DAILY_ASK_LIMIT_PAID;
    delete process.env.JEV_API_KEY;
  });

  await t.test("manages company profile, deterministic fit, version invalidation, and access", async () => {
    assert.equal((await request("/v1/me/company-profile")).status, 401);
    const empty = await request("/v1/me/company-profile", {}, authenticatedCookie);
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), { profile: null });

    const profile = {
      description: "Fornecemos equipamentos de informática e suporte técnico corporativo.",
      offerings: ["computadores", "suporte técnico"],
      exclusions: [],
      selectedCategories: ["ti-telecom"],
      selectedKeywords: ["servidor rack"],
      excludedKeywords: ["impressora"],
      coverage: { scope: "states", states: ["SP"] },
      valueRange: { min: null, max: 1000 },
      size: "other",
    };
    assert.equal(
      (
        await request(
          "/v1/me/company-profile",
          {
            method: "PUT",
            body: JSON.stringify(profile),
          },
          authenticatedCookie,
        )
      ).status,
      403,
    );
    const invalid = await request(
      "/v1/me/company-profile",
      {
        method: "PUT",
        headers: csrf,
        body: JSON.stringify({
          ...profile,
          offerings: ["Solução", "solucao"],
        }),
      },
      authenticatedCookie,
    );
    assert.equal(invalid.status, 400);

    const saved = await request(
      "/v1/me/company-profile",
      {
        method: "PUT",
        headers: csrf,
        body: JSON.stringify(profile),
      },
      authenticatedCookie,
    );
    assert.equal(saved.status, 200);
    const savedProfile = (await saved.json()) as {
      profile: {
        version: number;
        selectedCategories: string[];
        selectedKeywords: string[];
        excludedKeywords: string[];
      };
    };
    assert.equal(savedProfile.profile.version, 1);
    assert.deepEqual(savedProfile.profile.selectedCategories, ["ti-telecom"]);
    assert.deepEqual(savedProfile.profile.selectedKeywords, ["servidor rack"]);
    assert.deepEqual(savedProfile.profile.excludedKeywords, ["impressora"]);
    const fit = await request(`/v1/me/fit?tenderIds=${encodeURIComponent(tenderId)}`, {}, authenticatedCookie);
    assert.equal(fit.status, 200);
    const fitBody = (await fit.json()) as {
      profileVersion: number;
      results: Record<string, { status: string; level: string; reasons: Array<{ kind: string }> }>;
    };
    assert.equal(fitBody.profileVersion, 1);
    assert.equal(fitBody.results[tenderId]?.status, "filtered");
    assert.equal(fitBody.results[tenderId]?.level, "low");
    assert.equal(fitBody.results[tenderId]?.reasons[0]?.kind, "out_of_coverage");

    const session = await request("/v1/auth/session", {}, authenticatedCookie);
    const userId = ((await session.json()) as { user: { id: string } }).user.id;
    const explicitInterest = await rebuildInterestProfile(userId);
    assert.equal(
      explicitInterest.categories.find(({ value }) => value === "ti-telecom")?.weight,
      12,
    );
    assert.equal(
      explicitInterest.terms.find(({ value }) => value === "servidor rack")?.weight,
      12,
    );
    assert.ok(explicitInterest.exclusions.includes("impressora"));
    const [cachedBeforeTouch] = await db
      .select({
        id: companyTenderFitsTable.id,
        checkedAt: companyTenderFitsTable.checkedAt,
      })
      .from(companyTenderFitsTable)
      .where(eq(companyTenderFitsTable.userId, userId));
    assert.ok(cachedBeforeTouch);
    await db
      .update(tendersTable)
      .set({ updatedAt: new Date("2026-09-25T12:00:00.000Z") })
      .where(eq(tendersTable.id, tenderId));
    assert.equal((await request(`/v1/me/fit?tenderIds=${encodeURIComponent(tenderId)}`, {}, authenticatedCookie)).status, 200);
    const [cachedAfterTouch] = await db
      .select({
        id: companyTenderFitsTable.id,
        checkedAt: companyTenderFitsTable.checkedAt,
      })
      .from(companyTenderFitsTable)
      .where(eq(companyTenderFitsTable.userId, userId));
    assert.equal(cachedAfterTouch?.id, cachedBeforeTouch.id);
    assert.equal(cachedAfterTouch?.checkedAt?.toISOString(), cachedBeforeTouch.checkedAt?.toISOString());

    const replaced = await request(
      "/v1/me/company-profile",
      {
        method: "PUT",
        headers: csrf,
        body: JSON.stringify({
          ...profile,
          coverage: { scope: "national" },
        }),
      },
      authenticatedCookie,
    );
    assert.equal(((await replaced.json()) as { profile: { version: number } }).profile.version, 2);
    assert.equal((await db.select().from(companyTenderFitsTable).where(eq(companyTenderFitsTable.userId, userId))).length, 0);

    const expiredCookie = await login("fit-expired@example.test", false);
    const expiredSession = await request("/v1/auth/session", {}, expiredCookie);
    const expiredUserId = ((await expiredSession.json()) as { user: { id: string } }).user.id;
    await db
      .update(usersTable)
      .set({ trialEndsAt: new Date(0) })
      .where(eq(usersTable.id, expiredUserId));
    const noProfileFit = await request(`/v1/me/fit?tenderIds=${encodeURIComponent(tenderId)}`, {}, expiredCookie);
    assert.equal(noProfileFit.status, 200);
    assert.deepEqual(await noProfileFit.json(), {
      profileVersion: null,
      results: {},
    });
    assert.equal(
      (
        await request(
          "/v1/me/company-profile",
          {
            method: "PUT",
            headers: csrf,
            body: JSON.stringify(profile),
          },
          expiredCookie,
        )
      ).status,
      200,
    );
    assert.equal((await request(`/v1/me/fit?tenderIds=${encodeURIComponent(tenderId)}`, {}, expiredCookie)).status, 402);

    assert.equal((await request("/v1/me/company-profile", { method: "DELETE", headers: csrf }, authenticatedCookie)).status, 204);
    assert.equal((await db.select().from(companyProfilesTable).where(eq(companyProfilesTable.userId, userId))).length, 0);
    assert.equal((await db.select().from(aiFitDailyUsageTable).where(eq(aiFitDailyUsageTable.userId, userId))).length, 0);
  });

  await t.test(
    "serves accent-insensitive keyword autocomplete, related terms, categories and description suggestions",
    async () => {
      assert.equal((await request("/v1/profile/categories")).status, 401);
      await db
        .insert(profileKeywordVocabularyTable)
        .values([
          {
            normalizedTerm: "iluminacao",
            displayTerm: "iluminação",
            ngramSize: 1,
            openTenderCount: 14,
            predominantCategorySlug: "eventos-cultura",
            predominantCategoryLabel: "Eventos, shows e cultura",
            relatedTerms: [
              {
                normalizedTerm: "iluminacao cenica",
                displayTerm: "iluminação cênica",
                openTenderCount: 8,
              },
            ],
          },
          {
            normalizedTerm: "iluminacao cenica",
            displayTerm: "iluminação cênica",
            ngramSize: 2,
            openTenderCount: 8,
            predominantCategorySlug: "eventos-cultura",
            predominantCategoryLabel: "Eventos, shows e cultura",
          },
          {
            normalizedTerm: "som",
            displayTerm: "som",
            ngramSize: 1,
            openTenderCount: 20,
            predominantCategorySlug: "eventos-cultura",
            predominantCategoryLabel: "Eventos, shows e cultura",
            relatedTerms: [
              {
                normalizedTerm: "caixa de som",
                displayTerm: "caixa de som",
                openTenderCount: 7,
              },
            ],
          },
          {
            normalizedTerm: "caixa de som",
            displayTerm: "caixa de som",
            ngramSize: 3,
            openTenderCount: 7,
            predominantCategorySlug: "eventos-cultura",
            predominantCategoryLabel: "Eventos, shows e cultura",
          },
        ])
        .onConflictDoNothing();
      const accented = await request(
        "/v1/profile/keywords/suggest?q=iluminacao",
        {},
        authenticatedCookie,
      );
      assert.equal(accented.status, 200);
      assert.equal(
        ((await accented.json()) as { data: Array<{ displayTerm: string }> })
          .data[0]?.displayTerm,
        "iluminação",
      );
      const related = await request(
        "/v1/profile/keywords/suggest?q=som",
        {},
        authenticatedCookie,
      );
      const relatedData = (
        (await related.json()) as {
          data: Array<{ displayTerm: string; related: boolean }>;
        }
      ).data;
      assert.ok(
        relatedData.some(
          ({ displayTerm, related }) =>
            displayTerm === "caixa de som" && related,
        ),
      );
      const categories = await request(
        "/v1/profile/categories",
        {},
        authenticatedCookie,
      );
      assert.equal(categories.status, 200);
      assert.ok(
        (
          (await categories.json()) as { data: Array<{ slug: string }> }
        ).data.some(({ slug }) => slug === "eventos-cultura"),
      );
      const fromDescription = await request(
        "/v1/profile/keywords/from-description",
        {
          method: "POST",
          body: JSON.stringify({
            description:
              "Prestamos iluminação cênica e operação de som para eventos públicos.",
          }),
        },
        authenticatedCookie,
      );
      assert.equal(fromDescription.status, 200);
      const suggested = (await fromDescription.json()) as {
        keywords: Array<{ normalizedTerm: string }>;
        categories: Array<{ slug: string }>;
      };
      assert.ok(
        suggested.keywords.some(
          ({ normalizedTerm }) => normalizedTerm === "iluminacao cenica",
        ),
      );
      assert.equal(suggested.categories[0]?.slug, "eventos-cultura");
    },
  );

  await t.test("preserves monitor state and isolates users", async () => {
    assert.equal(Number((await pool.query("SELECT count(*) AS count FROM notifications")).rows[0].count), 0);
    assert.equal(
      (
        await request(
          `/v1/me/saved-tenders/${tenderId}`,
          {
            method: "PUT",
            headers: csrf,
            body: JSON.stringify({ monitored: true }),
          },
          authenticatedCookie,
        )
      ).status,
      200,
    );
    const preserved = await request(`/v1/me/saved-tenders/${tenderId}`, { method: "PUT", headers: csrf, body: "{}" }, authenticatedCookie);
    assert.equal(preserved.status, 200);
    assert.equal(((await preserved.json()) as { monitored: boolean }).monitored, true);

    const idsForB = await request("/v1/me/saved-tenders/ids", {}, userBCookie);
    assert.deepEqual(await idsForB.json(), { saved: [], monitored: [] });
    assert.equal((await request("/v1/me/saved-tenders/does-not-exist", { method: "PUT", headers: csrf, body: "{}" }, authenticatedCookie)).status, 404);
    const imported = await request(
      "/v1/me/saved-tenders/import",
      {
        method: "POST",
        headers: csrf,
        body: JSON.stringify({ ids: [tenderId, "does-not-exist"] }),
      },
      authenticatedCookie,
    );
    assert.deepEqual(await imported.json(), {
      imported: 0,
      alreadySaved: 1,
      notFound: ["does-not-exist"],
      skippedByLimit: 0,
    });
  });

  await t.test("creates idempotent tender-change notifications", async () => {
    const changed = publication(123, {
      situacaoCompraNome: "Suspensa",
      dataEncerramentoProposta: "2026-11-02T17:00:00",
      dataAtualizacao: "2026-09-23T11:00:00",
      valorTotalEstimado: 150,
    });
    await upsertPublications([changed], new Date("2026-09-23T14:00:00Z"));
    await upsertPublications([changed], new Date("2026-09-23T14:01:00Z"));

    const notifications = await request("/v1/me/notifications?pageSize=50", {}, authenticatedCookie);
    const body = (await notifications.json()) as {
      data: { type: string; change: { field: string } }[];
    };
    assert.deepEqual(
      body.data.map(({ type, change }) => [type, change.field]).sort(),
      [
        ["tender_deadline_changed", "proposalDeadline"],
        ["tender_status_changed", "status"],
        ["tender_value_changed", "estimatedValue"],
      ].sort(),
    );

    await db.transaction((tx) =>
      createDocumentAddedNotifications(tx, {
        tender: {
          id: tenderId,
          title: "Aquisição de computadores para TEST DATA",
          tenderNumberShort: "123/2026",
          organizationName: "Órgão de teste",
          proposalDeadline: new Date("2026-10-31T20:00:00Z"),
        },
        previousCount: 1,
        nextCount: 2,
        addedDocumentIds: ["document-2"],
        detectedAt: new Date("2026-09-23T14:02:00Z"),
      }),
    );
    await db.transaction((tx) =>
      createDocumentAddedNotifications(tx, {
        tender: {
          id: tenderId,
          title: "Aquisição de computadores para TEST DATA",
          tenderNumberShort: "123/2026",
          organizationName: "Órgão de teste",
          proposalDeadline: new Date("2026-10-31T20:00:00Z"),
        },
        previousCount: 1,
        nextCount: 2,
        addedDocumentIds: ["document-2"],
        detectedAt: new Date("2026-09-23T14:03:00Z"),
      }),
    );
    const documentAlerts = await db.select().from(notificationsTable).where(eq(notificationsTable.type, "tender_document_added"));
    assert.equal(documentAlerts.length, 1);
  });

  await t.test("alerts only the owner about new saved-search matches", async () => {
    const savedResponse = await request(
      "/v1/me/saved-searches",
      {
        method: "POST",
        headers: csrf,
        body: JSON.stringify({
          name: "Computadores",
          query: "?q=computadores&page=2",
          alertsEnabled: true,
        }),
      },
      authenticatedCookie,
    );
    assert.equal(savedResponse.status, 201);
    const saved = (await savedResponse.json()) as {
      id: string;
      query: string;
    };
    assert.equal(saved.query, "q=computadores");
    const duplicate = await request(
      "/v1/me/saved-searches",
      {
        method: "POST",
        headers: csrf,
        body: JSON.stringify({
          name: "Duplicada",
          query: "q=computadores&page=99",
          alertsEnabled: false,
        }),
      },
      authenticatedCookie,
    );
    assert.equal(duplicate.status, 409);
    assert.deepEqual(((await duplicate.json()) as { error: { details: unknown } }).error.details, [
      { field: "query", issue: "duplicate", existingId: saved.id },
    ]);
    assert.equal(
      (
        await request(
          `/v1/me/saved-searches/${saved.id}`,
          {
            method: "PATCH",
            headers: csrf,
            body: JSON.stringify({ name: "Intrusão" }),
          },
          userBCookie,
        )
      ).status,
      403,
    );

    const [checkpoint] = await db
      .select({ lastCheckedAt: savedSearchesTable.lastCheckedAt })
      .from(savedSearchesTable)
      .where(eq(savedSearchesTable.id, saved.id));
    const createdAt = new Date(checkpoint!.lastCheckedAt!.getTime() + 1_000);
    await upsertPublications([publication(124)], createdAt);
    await pool.query("UPDATE tenders SET created_at = $1 WHERE id = $2", [createdAt, "00394460000141-1-000124-2026"]);
    await runSavedSearchEvaluationJob(new Date(createdAt.getTime() + 1_000));

    const [updated] = await db.select().from(savedSearchesTable).where(eq(savedSearchesTable.id, saved.id));
    assert.equal(updated!.newMatchesCount, 1);
    const rows = await db.select().from(notificationsTable).where(eq(notificationsTable.type, "saved_search_new_matches"));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.userId, updated!.userId);
    assert.deepEqual(rows[0]!.tenderIds, ["00394460000141-1-000124-2026"]);

    assert.equal((await request(`/v1/me/saved-searches/${saved.id}`, { method: "DELETE", headers: csrf }, authenticatedCookie)).status, 204);
    const restored = await request(`/v1/me/saved-searches/${saved.id}/restore`, { method: "POST", headers: csrf }, authenticatedCookie);
    assert.equal(restored.status, 200);
    const restoredBody = (await restored.json()) as {
      id: string;
      newMatchesCount: number;
    };
    assert.equal(restoredBody.id, saved.id);
    assert.equal(restoredBody.newMatchesCount, 0);

    assert.equal((await request(`/v1/me/saved-searches/${saved.id}`, { method: "DELETE", headers: csrf }, authenticatedCookie)).status, 204);
    await db
      .update(savedSearchesTable)
      .set({ deletedAt: new Date(Date.now() - 31_000) })
      .where(eq(savedSearchesTable.id, saved.id));
    assert.equal((await request(`/v1/me/saved-searches/${saved.id}/restore`, { method: "POST", headers: csrf }, authenticatedCookie)).status, 409);
  });

  await t.test("enforces limits and reports partial imports", async () => {
    await pool.query(`
        INSERT INTO tenders (
          id, pncp_control_number, title, organization_id, organization_name,
          modality, modality_label, status, estimated_value_status, source_id,
          source_name, search_text, title_norm, object_norm, items_norm,
          organization_norm, other_norm, raw_payload, fetched_at
        )
        SELECT
          'limit-' || value,
          'TEST-LIMIT-' || value,
          'TEST DATA ' || value,
          'test-org',
          'TEST DATA',
          'other',
          'Outra',
          'open',
          'not_published',
          'test',
          'TEST DATA',
          'test data',
          'test data',
          '',
          '',
          'test data',
          '',
          '{}'::jsonb,
          now()
        FROM generate_series(1, 500) AS value
      `);
    assert.equal((await request(`/v1/me/saved-tenders/${tenderId}`, { method: "PUT", headers: csrf, body: "{}" }, userBCookie)).status, 200);
    const ids = Array.from({ length: 500 }, (_, index) => `limit-${index + 1}`);
    const imported = await request(
      "/v1/me/saved-tenders/import",
      {
        method: "POST",
        headers: csrf,
        body: JSON.stringify({ ids }),
      },
      userBCookie,
    );
    assert.deepEqual(await imported.json(), {
      imported: 499,
      alreadySaved: 0,
      notFound: [],
      skippedByLimit: 1,
    });
    assert.equal((await request("/v1/me/saved-tenders/limit-500", { method: "PUT", headers: csrf, body: "{}" }, userBCookie)).status, 409);

    const [userB] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, "user-b@example.test"));
    await db.insert(savedSearchesTable).values(
      Array.from({ length: 50 }, (_, index) => ({
        id: `limit-search-${index}`,
        userId: userB!.id,
        name: `TEST SEARCH ${index}`,
        query: `q=test-${index}`,
      })),
    );
    assert.equal(
      (
        await request(
          "/v1/me/saved-searches",
          {
            method: "POST",
            headers: csrf,
            body: JSON.stringify({
              name: "Excedente",
              query: "q=test",
              alertsEnabled: false,
            }),
          },
          userBCookie,
        )
      ).status,
      409,
    );
  });

  await t.test("purges expired sessions, read notifications and old email content at the configured cutoffs", async () => {
    const cookie = await login("retention@example.test");
    const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, "retention@example.test"));
    assert.ok(user);
    const now = new Date("2026-10-08T12:00:00.000Z");
    await db.insert(sessionsTable).values([
      { id: "retention-expired-old", userId: user.id, expiresAt: new Date("2026-08-01T12:00:00.000Z") },
      { id: "retention-revoked-old", userId: user.id, expiresAt: new Date("2027-01-01T00:00:00.000Z"), revokedAt: new Date("2026-08-01T12:00:00.000Z") },
      { id: "retention-expired-recent", userId: user.id, expiresAt: new Date("2026-09-20T12:00:00.000Z") },
    ]);
    await db.insert(notificationsTable).values([
      { id: "retention-read-old", userId: user.id, type: "test", dedupeKey: "retention-read-old", readAt: new Date("2026-01-01T00:00:00.000Z") },
      { id: "retention-unread-old", userId: user.id, type: "test", dedupeKey: "retention-unread-old", createdAt: new Date("2026-01-01T00:00:00.000Z") },
      { id: "retention-read-recent", userId: user.id, type: "test", dedupeKey: "retention-read-recent", readAt: new Date("2026-09-01T00:00:00.000Z") },
    ]);
    await db.insert(emailDeliveriesTable).values([
      {
        id: "retention-email-old", userId: user.id, mode: "digest", dedupeKey: "retention-email-old",
        recipientEmail: "retention@example.test", subject: "TEST OLD", htmlBody: "<p>personal</p>", textBody: "personal",
        messageHeaders: { "List-Unsubscribe": "personal" }, lastError: "personal error", createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "retention-email-recent", userId: user.id, mode: "digest", dedupeKey: "retention-email-recent",
        recipientEmail: "retention@example.test", subject: "TEST RECENT", htmlBody: "<p>keep</p>", textBody: "keep", createdAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    ]);

    const retention = await purgeRetainedPersonalData(now, { sessionDays: 30, readNotificationDays: 180, emailContentDays: 180, hour: 3 });
    assert.ok(retention.sessionsDeleted >= 2);
    assert.ok(retention.notificationsDeleted >= 1);
    assert.ok(retention.emailDeliveriesRedacted >= 1);
    assert.equal((await db.select().from(sessionsTable).where(eq(sessionsTable.id, "retention-expired-old"))).length, 0);
    assert.equal((await db.select().from(sessionsTable).where(eq(sessionsTable.id, "retention-revoked-old"))).length, 0);
    assert.equal((await db.select().from(sessionsTable).where(eq(sessionsTable.id, "retention-expired-recent"))).length, 1);
    assert.equal((await db.select().from(notificationsTable).where(eq(notificationsTable.id, "retention-unread-old"))).length, 1);
    assert.equal((await db.select().from(notificationsTable).where(eq(notificationsTable.id, "retention-read-recent"))).length, 1);
    const [redacted] = await db.select().from(emailDeliveriesTable).where(eq(emailDeliveriesTable.id, "retention-email-old"));
    assert.equal(redacted?.recipientEmail, REDACTED_RECIPIENT);
    assert.equal(redacted?.htmlBody, "");
    assert.equal(redacted?.textBody, "");
    assert.deepEqual(redacted?.messageHeaders, {});
    assert.equal(redacted?.lastError, null);
    const [recent] = await db.select().from(emailDeliveriesTable).where(eq(emailDeliveriesTable.id, "retention-email-recent"));
    assert.equal(recent?.textBody, "keep");
    assert.equal((await request("/v1/auth/session", {}, cookie)).status, 200);
  });

  await t.test("exports every user-owned table without secrets", async () => {
    const [exportUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, "user-a@example.test"));
    await db.insert(emailDeliveriesTable).values({
      id: "export-email",
      userId: exportUser!.id,
      mode: "digest",
      dedupeKey: "export-email",
      recipientEmail: "user-a@example.test",
      subject: "TEST DATA aviso enviado",
      htmlBody: "<p>TEST DATA corpo HTML</p>",
      textBody: "TEST DATA corpo texto",
      status: "sent",
      sentAt: new Date("2026-10-01T12:00:00.000Z"),
    });
    await db.insert(aiAskRequestsTable).values({
      id: "export-ai-question",
      userId: exportUser!.id,
      tenderId,
      question: "TEST DATA Qual e o prazo?",
      normalizedQuestion: "test data qual e o prazo?",
      indexVersion: 1,
      requestedModel: "jev-1.13.0",
      responseModel: "jev-1.13.0",
      status: "answered",
      passages: [{ documentId: "export-doc", documentTitle: "Edital", documentUrl: "https://example.test/edital.pdf", page: 2, text: "TEST DATA passagem vinculada", relevance: 0.9 }],
      summary: { text: "TEST DATA resposta", citations: [1], model: "summary-test" },
    });
    await db.insert(aiDailyUsageTable).values({ userId: exportUser!.id, quotaDay: "2030-01-01", used: 1 });
    await db.insert(aiDailyTendersTable).values({ userId: exportUser!.id, quotaDay: "2030-01-01", tenderId });
    await db.insert(aiJobsTable).values({
      id: "export-ai-job", kind: "fit", dedupeKey: "export-ai-job", tenderId, userId: exportUser!.id, lane: "interactive", status: "succeeded",
    });
    const preference = await request("/v1/me/recommendation-preferences", {
      method: "PUT", headers: csrf, body: JSON.stringify({ personalizationEnabled: true }),
    }, authenticatedCookie);
    assert.equal(preference.status, 200);
    const event = await request("/v1/recommendations/events", {
      method: "POST", headers: csrf, body: JSON.stringify({ type: "search", query: "hemodiálise hospitalar" }),
    }, authenticatedCookie);
    assert.equal(event.status, 202);
    assert.equal(((await event.json()) as { recorded: boolean }).recorded, true);
    const response = await request("/v1/me/export", {}, authenticatedCookie);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-disposition") ?? "", /^attachment; filename="pardal-digital-dados-\d{4}-\d{2}-\d{2}\.json"$/);
    assert.equal(response.headers.get("cache-control"), "no-store");

    const body = (await response.json()) as {
      user: {
        email: string;
        emailDigest: string;
        emailImmediateCritical: boolean;
      };
      sessions: unknown[];
      savedTenders: { tenderId: string }[];
      savedSearches: { deletedAt: string | null }[];
      emailDeliveries: { subject: string; htmlBody: string; textBody: string; status: string }[];
      aiQuestions: { question: string; passages: { text: string }[]; summary: { text: string } | null }[];
      aiDailyUsage: { quotaDay: string }[];
      aiDailyTenders: { quotaDay: string; tenderId: string }[];
      aiJobs: { id: string; kind: string; status: string }[];
      recommendationEvents: { normalizedTerms: string[] }[];
      [key: string]: unknown;
    };
    assert.equal(body.user.email, "user-a@example.test");
    assert.equal(body.user.emailDigest, "daily");
    assert.equal(body.user.emailImmediateCritical, true);
    assert.equal(body.emailDeliveries[0]?.subject, "TEST DATA aviso enviado");
    assert.equal(body.emailDeliveries[0]?.htmlBody, "<p>TEST DATA corpo HTML</p>");
    assert.equal(body.emailDeliveries[0]?.textBody, "TEST DATA corpo texto");
    assert.deepEqual(
      body.aiQuestions.map(({ question }) => question),
      ["TEST DATA Qual e o prazo?"],
    );
    assert.equal(body.aiQuestions[0]?.passages[0]?.text, "TEST DATA passagem vinculada");
    assert.equal(body.aiQuestions[0]?.summary?.text, "TEST DATA resposta");
    assert.ok(body.aiDailyUsage.some(({ quotaDay }) => quotaDay === "2030-01-01"));
    assert.ok(body.aiDailyTenders.some((row) => row.quotaDay === "2030-01-01" && row.tenderId === tenderId));
    assert.deepEqual(body.aiJobs.map(({ id, kind, status }) => ({ id, kind, status })), [{ id: "export-ai-job", kind: "fit", status: "succeeded" }]);
    assert.ok(body.sessions.length > 0);
    assert.ok(body.savedTenders.some(({ tenderId: id }) => id === tenderId));
    assert.ok(body.savedSearches.some(({ deletedAt }) => deletedAt !== null));
    assert.deepEqual(body.recommendationEvents.at(-1)?.normalizedTerms, ["hemodialise", "hospitalar"]);

    const userOwnedTables = await pool.query<{ table_name: string }>(
      `select c.table_name
       from information_schema.columns c
       join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
       where c.table_schema=$1 and c.column_name='user_id' and t.table_type='BASE TABLE'
       order by c.table_name`,
      ["public"],
    );
    assert.deepEqual(userOwnedTables.rows.map(({ table_name }) => table_name), Object.keys(ACCOUNT_EXPORT_TABLES).sort());
    for (const exportKey of Object.values(ACCOUNT_EXPORT_TABLES)) {
      assert.ok(exportKey in body, `${exportKey} must be present in the account export`);
    }

    const serialized = JSON.stringify(body);
    const sessionToken = authenticatedCookie.split("=", 2)[1]!;
    const { sha256 } = await import("../auth/tokens");
    assert.equal(serialized.includes(sessionToken), false);
    assert.equal(serialized.includes(sha256(sessionToken)), false);
    assert.equal(serialized.includes("user-b@example.test"), false);
    assert.equal(serialized.includes("asaasSubscriptionId"), false);
    assert.equal(serialized.includes("dedupeKey"), false);
  });

  await t.test("does not record behavioral events without opt-in, erases them on opt-out, and persists dismiss", async () => {
    const cookie = await login("recommendations-privacy@example.test");
    const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, "recommendations-privacy@example.test"));
    assert.ok(user);
    const ignored = await request("/v1/recommendations/events", {
      method: "POST", headers: csrf, body: JSON.stringify({ type: "search", query: "medicamentos" }),
    }, cookie);
    assert.equal(ignored.status, 202);
    assert.equal(((await ignored.json()) as { recorded: boolean }).recorded, false);
    assert.equal((await db.select().from(recommendationEventsTable).where(eq(recommendationEventsTable.userId, user.id))).length, 0);

    assert.equal((await request("/v1/me/recommendation-preferences", {
      method: "PUT", headers: csrf, body: JSON.stringify({ personalizationEnabled: true }),
    }, cookie)).status, 200);
    assert.equal((await request("/v1/recommendations/events", {
      method: "POST", headers: csrf, body: JSON.stringify({ type: "tender_view", tenderId }),
    }, cookie)).status, 202);
    assert.equal((await db.select().from(recommendationEventsTable).where(eq(recommendationEventsTable.userId, user.id))).length, 1);
    assert.equal((await request(`/v1/me/saved-tenders/${encodeURIComponent(tenderId)}`, {
      method: "PUT", headers: csrf, body: JSON.stringify({ monitored: true }),
    }, cookie)).status, 200);
    const interest = await rebuildInterestProfile(user.id);
    assert.ok(interest.signalCount >= 3);
    assert.ok(interest.terms.some(({ weight }) => weight >= 10), "monitored tender should be a strong interest signal");
    await db.insert(userRecommendationsTable).values({ userId: user.id, tenderId, rank: 1, score: '42', reasons: [] }).onConflictDoUpdate({
      target: [userRecommendationsTable.userId, userRecommendationsTable.tenderId],
      set: { rank: 1, score: '42', reasons: [] },
    });
    const positive = await request('/v1/recommendations/events', {
      method: 'POST', headers: csrf, body: JSON.stringify({ type: 'interest', tenderId }),
    }, cookie);
    assert.equal(positive.status, 202);
    assert.equal(((await positive.json()) as { recorded: boolean }).recorded, true);
    assert.equal((await db.select().from(userRecommendationsTable).where(eq(userRecommendationsTable.userId, user.id))).length, 0);
    const interests = (await db.select().from(recommendationMetricsDailyTable)).reduce((sum, metric) => sum + metric.interests, 0);
    assert.ok(interests >= 1);
    const duplicate = await request('/v1/recommendations/events', {
      method: 'POST', headers: csrf, body: JSON.stringify({ type: 'interest', tenderId }),
    }, cookie);
    assert.equal(((await duplicate.json()) as { recorded: boolean }).recorded, false);
    assert.equal((await db.select().from(recommendationMetricsDailyTable)).reduce((sum, metric) => sum + metric.interests, 0), interests);
    assert.equal((await request(`/v1/recommendations/${encodeURIComponent(tenderId)}/dismiss`, {
      method: "POST", headers: csrf, body: "{}",
    }, cookie)).status, 204);
    assert.equal((await db.select().from(recommendationDismissalsTable).where(eq(recommendationDismissalsTable.userId, user.id))).length, 1);

    assert.equal((await request("/v1/me/recommendation-preferences", {
      method: "PUT", headers: csrf, body: JSON.stringify({ personalizationEnabled: false }),
    }, cookie)).status, 200);
    assert.equal((await db.select().from(recommendationEventsTable).where(eq(recommendationEventsTable.userId, user.id))).length, 0);
  });

  await t.test("deletes the account atomically, cascades personal data, and clears the cookie", async () => {
    const cookie = await login("delete-route@example.test");
    const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, "delete-route@example.test"));
    assert.ok(user);
    await db.insert(betaAccessGrantsTable).values({
      email: "delete-route@example.test",
      accessUntil: new Date("2099-01-01T00:00:00.000Z"),
    });
    await db.delete(subscriptionsTable).where(eq(subscriptionsTable.userId, user.id));
    await db.insert(savedSearchesTable).values({
      id: "delete-route-search",
      userId: user.id,
      name: "TEST DELETE",
      query: "q=delete",
    });
    await db.insert(savedTendersTable).values({ userId: user.id, tenderId });
    await db.insert(notificationsTable).values({
      id: "delete-route-notification",
      userId: user.id,
      type: "tender_status_changed",
      dedupeKey: "delete-route-dedupe",
    });
    await db.insert(emailDeliveriesTable).values({
      id: "delete-route-delivery",
      userId: user.id,
      mode: "digest",
      dedupeKey: "delete-route-delivery",
      recipientEmail: "delete-route@example.test",
      subject: "TEST DELETE",
      htmlBody: "<p>TEST DELETE</p>",
      textBody: "TEST DELETE",
    });
    await db.insert(emailDeliveryNotificationsTable).values({
      deliveryId: "delete-route-delivery",
      notificationId: "delete-route-notification",
    });
    await db.insert(aiDailyUsageTable).values({
      userId: user.id,
      quotaDay: "2026-09-25",
      used: 1,
    });
    await db.insert(aiAskRequestsTable).values({
      id: "delete-route-ai-question",
      userId: user.id,
      tenderId,
      question: "TEST DATA pergunta pessoal",
      normalizedQuestion: "test data pergunta pessoal",
      indexVersion: 1,
      requestedModel: "jev-1.13.0",
      status: "not_found",
    });
    await db.insert(aiJobsTable).values({
      id: "delete-route-ai-job", kind: "fit", dedupeKey: "delete-route-ai-job", tenderId, userId: user.id, lane: "interactive",
    });
    await db.update(usersTable).set({ recommendationPersonalizationEnabled: true }).where(eq(usersTable.id, user.id));
    await db.insert(recommendationEventsTable).values({ userId: user.id, type: "search", normalizedTerms: ["historico"] });

    const missingConfirmation = await request("/v1/me", { method: "DELETE", headers: csrf, body: "{}" }, cookie);
    assert.equal(missingConfirmation.status, 400);
    assert.equal(((await missingConfirmation.json()) as { error: { code: string } }).error.code, "INVALID_PARAMETER");
    assert.equal(
      (
        await request(
          "/v1/me",
          {
            method: "DELETE",
            body: JSON.stringify({ confirm: "EXCLUIR" }),
          },
          cookie,
        )
      ).status,
      403,
    );

    const deleted = await request(
      "/v1/me",
      {
        method: "DELETE",
        headers: csrf,
        body: JSON.stringify({ confirm: "EXCLUIR" }),
      },
      cookie,
    );
    assert.equal(deleted.status, 204);
    assert.match(deleted.headers.get("set-cookie") ?? "", /^licita_session=;/);
    assert.equal((await request("/v1/auth/session", {}, cookie)).status, 401);

    assert.equal(Number((await pool.query("select count(*) as count from users where id=$1", [user.id])).rows[0].count), 0);
    const userOwnedTables = await pool.query<{ table_name: string }>(
      `select c.table_name
       from information_schema.columns c
       join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
       where c.table_schema=$1 and c.column_name='user_id' and t.table_type='BASE TABLE'
       order by c.table_name`,
      ["public"],
    );
    for (const { table_name: table } of userOwnedTables.rows) {
      const result = await pool.query(`select count(*) as count from "${table}" where user_id=$1`, [user.id]);
      assert.equal(Number(result.rows[0].count), 0, `${table} should be empty for the deleted user`);
    }
    const nonCascadeUserTables = await pool.query<{ table_name: string }>(
      `select c.table_name
       from information_schema.columns c
       join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
       where c.table_schema=$1 and c.column_name='user_id' and t.table_type='BASE TABLE'
         and not exists (
           select 1 from pg_constraint fk
           join pg_class child on child.oid=fk.conrelid
           join pg_namespace ns on ns.oid=child.relnamespace
           join pg_class parent on parent.oid=fk.confrelid
           where fk.contype='f' and ns.nspname=$1 and child.relname=c.table_name
             and parent.relname='users' and fk.confdeltype='c'
         )`,
      ["public"],
    );
    assert.deepEqual(nonCascadeUserTables.rows, [], "every user_id table must cascade account deletion");
    assert.equal(
      Number((await pool.query("SELECT count(*) AS count FROM email_delivery_notifications WHERE delivery_id = $1", ["delete-route-delivery"])).rows[0].count),
      0,
    );
    assert.equal((await db.select().from(betaAccessGrantsTable).where(eq(betaAccessGrantsTable.email, "delete-route@example.test"))).length, 0);
  });

  await t.test("keeps the local account intact when Asaas cancellation fails", async () => {
    const cookie = await login("delete-asaas@example.test");
    const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, "delete-asaas@example.test"));
    assert.ok(user);
    await db.update(subscriptionsTable).set({ asaasSubscriptionId: "sub_delete_test" }).where(eq(subscriptionsTable.userId, user.id));

    let cancellationCalls = 0;
    await assert.rejects(
      deleteAccount(user.id, {
        cancelAsaasSubscription: async (subscriptionId) => {
          cancellationCalls += 1;
          assert.equal(subscriptionId, "sub_delete_test");
          throw new BillingUnavailableError("TEST Asaas outage");
        },
      }),
      (error: unknown) => error instanceof BillingUnavailableError && error.status === 503,
    );
    assert.equal(cancellationCalls, 1);
    assert.equal((await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, user.id))).length, 1);
    assert.equal((await request("/v1/auth/session", {}, cookie)).status, 200);

    await assert.rejects(
      deleteAccount(user.id, {
        cancelAsaasSubscription: async () => {
          cancellationCalls += 1;
        },
        deleteLocalAccount: async () => {
          throw new Error("TEST database outage");
        },
      }),
      /TEST database outage/,
    );
    const [compensated] = await db.select({ status: subscriptionsTable.status }).from(subscriptionsTable).where(eq(subscriptionsTable.userId, user.id));
    assert.equal(compensated?.status, "canceled");
    assert.equal((await request("/v1/auth/session", {}, cookie)).status, 200);

    await deleteAccount(user.id, {
      cancelAsaasSubscription: async () => {
        cancellationCalls += 1;
      },
    });
    assert.equal(cancellationCalls, 2);
    assert.equal((await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, user.id))).length, 0);
  });

  await t.test("preserves one Google trial across account deletion", async () => {
    const identity = {
      sub: "google-subject-trial-test",
      email: "google-trial@example.test",
      name: "TEST GOOGLE USER",
      picture: null,
    };
    const startedAt = new Date("2026-09-24T12:00:00.000Z");
    const first = await upsertGoogleUser(identity, startedAt);
    const [firstRow] = await db.select({ trialEndsAt: usersTable.trialEndsAt }).from(usersTable).where(eq(usersTable.id, first.id));
    assert.equal(firstRow?.trialEndsAt.toISOString(), "2026-10-01T12:00:00.000Z");

    await deleteAccount(first.id);
    const tombstones = await db.select().from(googleTrialTombstonesTable);
    assert.equal(tombstones.length, 1);
    assert.equal(tombstones[0]?.subjectHash.includes(identity.sub), false);

    const recreated = await upsertGoogleUser(identity, new Date("2026-10-10T12:00:00.000Z"));
    const [recreatedRow] = await db.select({ trialEndsAt: usersTable.trialEndsAt }).from(usersTable).where(eq(usersTable.id, recreated.id));
    assert.notEqual(recreated.id, first.id);
    assert.equal(recreatedRow?.trialEndsAt.toISOString(), firstRow?.trialEndsAt.toISOString());
  });

  await t.test("creates one trial-ending notification during the D-3 window", async () => {
    const cookie = await login("trial-ending@example.test", false);
    const paidCookie = await login("trial-ending-paid@example.test");
    const session = await request("/v1/auth/session", {}, cookie);
    const paidSession = await request("/v1/auth/session", {}, paidCookie);
    const userId = ((await session.json()) as { user: { id: string } }).user.id;
    const paidUserId = ((await paidSession.json()) as { user: { id: string } }).user.id;
    const now = new Date("2026-09-24T12:00:00.000Z");
    const trialEndsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    await db.update(usersTable).set({ trialEndsAt }).where(eq(usersTable.id, userId));
    await db.update(usersTable).set({ trialEndsAt }).where(eq(usersTable.id, paidUserId));

    assert.equal(await createTrialEndingNotifications(now), 1);
    assert.equal(await createTrialEndingNotifications(now), 0);
    const alerts = await db.select().from(notificationsTable).where(eq(notificationsTable.userId, userId));
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]?.type, "trial_ending");
    assert.deepEqual(alerts[0]?.change, {
      field: "trialEndsAt",
      from: null,
      to: trialEndsAt.toISOString(),
    });
    assert.equal((await db.select().from(notificationsTable).where(eq(notificationsTable.userId, paidUserId))).length, 0);
  });

  await t.test("delivers daily digests and grouped critical email alerts idempotently", async () => {
    const now = new Date("2026-09-25T10:00:00.000Z");
    const userIdFor = async (cookie: string): Promise<string> => {
      const response = await request("/v1/auth/session", {}, cookie);
      return ((await response.json()) as { user: { id: string } }).user.id;
    };
    await db.update(usersTable).set({ emailDigest: "off", emailImmediateCritical: false });

    const digestCookie = await login("email-digest@example.test");
    const digestUserId = await userIdFor(digestCookie);
    await db.update(usersTable).set({ emailDigest: "daily" }).where(eq(usersTable.id, digestUserId));
    await db.insert(notificationsTable).values([
      {
        id: "email-digest-document",
        userId: digestUserId,
        type: "tender_document_added",
        dedupeKey: "email-test:digest:document",
        createdAt: new Date(now.getTime() - 60_000),
        readAt: now,
        tenderId,
        tenderTitle: "TEST DATA computadores",
        tenderNumberShort: "123/2026",
        tenderOrganizationName: "Órgão de teste",
        tenderProposalDeadline: new Date("2026-10-31T20:00:00Z"),
        change: { field: "documents", from: 1, to: 2 },
      },
      {
        id: "email-digest-value",
        userId: digestUserId,
        type: "tender_value_changed",
        dedupeKey: "email-test:digest:value",
        createdAt: new Date(now.getTime() - 30_000),
        tenderId,
        tenderTitle: "TEST DATA computadores",
        tenderNumberShort: "123/2026",
        tenderOrganizationName: "Órgão de teste",
        tenderProposalDeadline: new Date("2026-10-31T20:00:00Z"),
        change: { field: "estimatedValue", from: 100, to: 200 },
      },
    ]);
    const digestMessages: EmailMessage[] = [];
    const digestSend = async (message: EmailMessage) => {
      digestMessages.push(message);
      return {
        status: "sent" as const,
        providerMessageId: `digest-${digestMessages.length}`,
      };
    };
    assert.deepEqual(await runDailyEmailDigest(now, digestSend), {
      queued: 1,
      sent: 1,
      failed: 0,
      skipped: 0,
    });
    assert.equal(digestMessages.length, 1);
    assert.match(digestMessages[0]!.html, /Órgão de teste/);
    assert.match(digestMessages[0]!.text, /TEST DATA computadores/);
    assert.equal(digestMessages[0]!.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.deepEqual(await runDailyEmailDigest(now, digestSend), {
      queued: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    });
    assert.equal(digestMessages.length, 1);
    assert.equal(
      (
        await db
          .select()
          .from(emailDeliveryNotificationsTable)
          .where(inArray(emailDeliveryNotificationsTable.notificationId, ["email-digest-document", "email-digest-value"]))
      ).length,
      2,
    );

    await db.update(usersTable).set({ emailDigest: "off" }).where(eq(usersTable.id, digestUserId));
    const skippedCookie = await login("email-skipped@example.test");
    const skippedUserId = await userIdFor(skippedCookie);
    await db.insert(notificationsTable).values({
      id: "email-skipped-notification",
      userId: skippedUserId,
      type: "tender_document_added",
      dedupeKey: "email-test:skipped",
      createdAt: new Date(now.getTime() - 20_000),
      tenderId,
      tenderTitle: "TEST DATA sem Resend",
    });
    assert.deepEqual(await runDailyEmailDigest(now), {
      queued: 1,
      sent: 0,
      failed: 0,
      skipped: 1,
    });

    await db.update(usersTable).set({ emailDigest: "off" });
    const immediateCookie = await login("email-immediate@example.test");
    const immediateUserId = await userIdFor(immediateCookie);
    const unmonitoredCookie = await login("email-unmonitored@example.test");
    const unmonitoredUserId = await userIdFor(unmonitoredCookie);
    const expiredCookie = await login("email-expired@example.test", false);
    const expiredUserId = await userIdFor(expiredCookie);
    const trialCookie = await login("email-trial-ending@example.test", false);
    const trialUserId = await userIdFor(trialCookie);
    await db
      .update(usersTable)
      .set({ emailImmediateCritical: true })
      .where(inArray(usersTable.id, [immediateUserId, unmonitoredUserId, expiredUserId, trialUserId]));
    await db
      .update(usersTable)
      .set({ trialEndsAt: new Date("2000-01-01T00:00:00.000Z") })
      .where(inArray(usersTable.id, [expiredUserId, trialUserId]));
    await db.insert(savedTendersTable).values({
      userId: immediateUserId,
      tenderId,
      monitored: true,
      monitoredAt: now,
    });
    const old = new Date(now.getTime() - 11 * 60_000);
    const snapshot = {
      createdAt: old,
      tenderId,
      tenderTitle: "TEST DATA crítico",
      tenderNumberShort: "123/2026",
      tenderOrganizationName: "Órgão de teste",
      tenderProposalDeadline: new Date("2026-10-31T20:00:00Z"),
    };
    await db.insert(notificationsTable).values([
      {
        ...snapshot,
        id: "email-critical-deadline",
        userId: immediateUserId,
        type: "tender_deadline_changed",
        dedupeKey: "email-test:critical:deadline",
        change: {
          field: "proposalDeadline",
          from: "2026-10-30T20:00:00.000Z",
          to: "2026-10-31T20:00:00.000Z",
        },
      },
      {
        ...snapshot,
        id: "email-critical-status",
        userId: immediateUserId,
        type: "tender_status_changed",
        dedupeKey: "email-test:critical:status",
        change: { field: "status", from: "open", to: "suspended" },
      },
      {
        ...snapshot,
        id: "email-noncritical-status",
        userId: immediateUserId,
        type: "tender_status_changed",
        dedupeKey: "email-test:noncritical:status",
        change: { field: "status", from: "under_review", to: "open" },
      },
      {
        ...snapshot,
        id: "email-noncritical-document",
        userId: immediateUserId,
        type: "tender_document_added",
        dedupeKey: "email-test:noncritical:document",
        change: { field: "documents", from: 1, to: 2 },
      },
      {
        ...snapshot,
        id: "email-window-pending",
        userId: immediateUserId,
        type: "tender_deadline_changed",
        dedupeKey: "email-test:window",
        createdAt: new Date(now.getTime() - 5 * 60_000),
        change: {
          field: "proposalDeadline",
          from: null,
          to: "2026-10-31T20:00:00.000Z",
        },
      },
      {
        ...snapshot,
        id: "email-unmonitored",
        userId: unmonitoredUserId,
        type: "tender_deadline_changed",
        dedupeKey: "email-test:unmonitored",
        change: {
          field: "proposalDeadline",
          from: null,
          to: "2026-10-31T20:00:00.000Z",
        },
      },
      {
        ...snapshot,
        id: "email-no-access",
        userId: expiredUserId,
        type: "tender_deadline_changed",
        dedupeKey: "email-test:no-access",
        change: {
          field: "proposalDeadline",
          from: null,
          to: "2026-10-31T20:00:00.000Z",
        },
      },
      {
        id: "email-trial-exception",
        userId: trialUserId,
        type: "trial_ending",
        dedupeKey: "email-test:trial-exception",
        createdAt: old,
        change: {
          field: "trialEndsAt",
          from: null,
          to: "2026-09-28T10:00:00.000Z",
        },
      },
    ]);
    const immediateMessages: EmailMessage[] = [];
    const immediateSend = async (message: EmailMessage) => {
      immediateMessages.push(message);
      return {
        status: "sent" as const,
        providerMessageId: `immediate-${immediateMessages.length}`,
      };
    };
    assert.deepEqual(
      await runImmediateEmailAlerts(now, {
        windowMinutes: 10,
        sendEmail: immediateSend,
      }),
      { queued: 2, sent: 2, failed: 0, skipped: 0 },
    );
    assert.equal(immediateMessages.length, 2);
    const monitoredMessage = immediateMessages.find(({ to }) => to === "email-immediate@example.test");
    assert.ok(monitoredMessage);
    assert.match(monitoredMessage.text, /Prazo alterado: .* → .*/);
    assert.match(monitoredMessage.text, /Novo status: Suspenso/);
    assert.doesNotMatch(monitoredMessage.text, /Novos documentos/);
    assert.deepEqual(
      await runImmediateEmailAlerts(now, {
        windowMinutes: 10,
        sendEmail: immediateSend,
      }),
      { queued: 0, sent: 0, failed: 0, skipped: 0 },
    );

    const retryCookie = await login("email-retry@example.test");
    const retryUserId = await userIdFor(retryCookie);
    await db.update(usersTable).set({ emailDigest: "off", emailImmediateCritical: true }).where(eq(usersTable.id, retryUserId));
    await db.insert(savedTendersTable).values({
      userId: retryUserId,
      tenderId,
      monitored: true,
      monitoredAt: now,
    });
    await db.insert(notificationsTable).values({
      ...snapshot,
      id: "email-retry-notification",
      userId: retryUserId,
      type: "tender_deadline_changed",
      dedupeKey: "email-test:retry",
      change: {
        field: "proposalDeadline",
        from: null,
        to: "2026-10-31T20:00:00.000Z",
      },
    });
    assert.deepEqual(
      await runImmediateEmailAlerts(now, {
        windowMinutes: 10,
        sendEmail: async () => ({
          status: "failed",
          reason: "temporary failure",
          retryable: true,
        }),
      }),
      { queued: 1, sent: 0, failed: 1, skipped: 0 },
    );
    const [failedDelivery] = await db.select().from(emailDeliveriesTable).where(eq(emailDeliveriesTable.userId, retryUserId));
    assert.equal(failedDelivery?.status, "failed");
    assert.equal(failedDelivery?.attempts, 1);
    assert.equal(failedDelivery?.nextAttemptAt?.toISOString(), new Date(now.getTime() + 60_000).toISOString());
    assert.deepEqual(
      await retryEmailDeliveries(new Date(now.getTime() + 2 * 60_000), async () => ({
        status: "sent",
        providerMessageId: "retry-success",
      })),
      { queued: 1, sent: 1, failed: 0, skipped: 0 },
    );
    const [sentDelivery] = await db.select().from(emailDeliveriesTable).where(eq(emailDeliveriesTable.id, failedDelivery!.id));
    assert.equal(sentDelivery?.status, "sent");
    assert.equal(sentDelivery?.attempts, 2);
    assert.equal(sentDelivery?.providerMessageId, "retry-success");
  });
});
