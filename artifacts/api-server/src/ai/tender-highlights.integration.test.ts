import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { EmailMessage } from "../email/email-client";

// Opt-in: uses real Postgres in an isolated schema. The public schema must have
// the application migrations applied before PNCP_TEST_DATABASE_URL is set.
test("Tender highlights read stored data only, in cards and e-mails", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  const schema = `tender_highlights_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.PUBLIC_APP_ORIGIN = "http://localhost:24252";
  process.env.AUTH_DEV_LOGIN = "true";
  process.env.SESSION_SECRET = "tender-highlights-secret-at-least-32-characters";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.RATE_LIMIT_AUTH_PER_MINUTE = "1000";
  // Any configured model would be a real call: the paths under test must not need one.
  process.env.OPENAI_API_KEY = "test-key-that-must-never-be-used";
  process.env.JEV_API_KEY = "test-key-that-must-never-be-used";
  delete process.env.BILLING_MONTHLY_BRL;
  delete process.env.BILLING_DEV_ENTITLED;

  const {
    aiJobsTable,
    companyProfilesTable,
    companyTenderFitsTable,
    db,
    emailDeliveriesTable,
    notificationsTable,
    pool,
    subscriptionsTable,
    tenderAiSheetsTable,
    tendersTable,
    usersTable,
  } = await import("@workspace/db");
  const { count, eq } = await import("drizzle-orm");
  const { default: app } = await import("../app");
  const { upsertPublications } = await import("../ingest/upsert-tenders");
  const { runDailyEmailDigest } = await import("../email/email-service");
  const { loadEmailTenderHighlights, loadRequirementHighlights } = await import("./tender-highlights");

  await pool.query(`CREATE SCHEMA "${schema}"`);
  for (const table of [
    "tenders",
    "users",
    "google_trial_tombstones",
    "sessions",
    "saved_tenders",
    "saved_searches",
    "notifications",
    "subscriptions",
    "email_deliveries",
    "email_delivery_notifications",
    "ai_jobs",
    "tender_ai_sheets",
    "company_profiles",
    "company_tender_fits",
    "workspaces",
    "workspace_members",
    "user_workspace_preferences",
    "workspace_profiles",
    "workspace_profile_signals",
    "workspace_cutover_events",
  ]) {
    await pool.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
  }
  for (const migration of ["0018_beta_access.sql", "0035_coupons.sql"]) {
    await pool.query(
      readFileSync(new URL(`../../../../lib/db/migrations/${migration}`, import.meta.url), "utf8"),
    );
  }

  const server: Server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // Every outbound request other than this test's own server fails the test: no OpenAI, Jev, Brevo or PNCP call.
  const realFetch = globalThis.fetch;
  const outbound: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const target = input instanceof Request ? input.url : String(input);
    if (!target.startsWith(baseUrl)) {
      outbound.push(target);
      throw new Error(`Unexpected outbound request: ${target}`);
    }
    return realFetch(input, init);
  }) as typeof fetch;

  // The guard itself works: a model call would reject and be recorded.
  await assert.rejects(fetch("https://api.openai.com/v1/responses"), /Unexpected outbound request/);
  assert.deepEqual(outbound.splice(0), ["https://api.openai.com/v1/responses"]);

  t.after(async () => {
    globalThis.fetch = realFetch;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  });

  const request = (path: string, cookie?: string): Promise<Response> =>
    fetch(`${baseUrl}/api${path}`, { headers: cookie ? { Cookie: cookie } : {} });
  const login = async (email: string, subscribed: boolean): Promise<{ cookie: string; userId: string }> => {
    const response = await fetch(`${baseUrl}/api/v1/auth/dev-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:24252",
        "X-Requested-With": "licita-insight",
      },
      body: JSON.stringify({ email, name: "TEST USER" }),
    });
    assert.equal(response.status, 204);
    const cookie = response.headers.get("set-cookie")!.split(";", 1)[0]!;
    const session = await request("/v1/auth/session", cookie);
    const userId = ((await session.json()) as { user: { id: string } }).user.id;
    if (subscribed) {
      await db.insert(subscriptionsTable).values({
        userId,
        status: "active",
        currentPeriodEnd: new Date("2099-01-01T00:00:00.000Z"),
      });
    } else {
      await db
        .update(usersTable)
        .set({ trialEndsAt: new Date("2020-01-01T00:00:00.000Z") })
        .where(eq(usersTable.id, userId));
    }
    return { cookie, userId };
  };

  const tenderId = (sequence: number) => `00394460000141-1-${String(sequence).padStart(6, "0")}-2026`;
  await upsertPublications(
    [801, 802, 803].map((sequence) => ({
      numeroControlePNCP: `00394460000141-1-${String(sequence).padStart(6, "0")}/2026`,
      objetoCompra: "Serviços de limpeza predial para TEST DATA",
      numeroCompra: String(sequence),
      anoCompra: 2026,
      modalidadeId: 6,
      modalidadeNome: "Pregão - Eletrônico",
      situacaoCompraNome: "Divulgada no PNCP",
      dataPublicacaoPncp: "2026-10-10T09:00:00",
      dataEncerramentoProposta: "2026-10-30T17:00:00",
      dataAtualizacao: "2026-10-10T10:00:00",
      valorTotalEstimado: 100,
      orcamentoSigilosoCodigo: 1,
      orgaoEntidade: { cnpj: "00394460000141", razaoSocial: "Órgão de teste" },
      unidadeOrgao: { ufSigla: "DF", municipioNome: "Brasília" },
    })),
    new Date("2026-10-10T13:00:00Z"),
  );
  const [withData, withoutData, processing] = [tenderId(801), tenderId(802), tenderId(803)];
  await db
    .update(tendersTable)
    .set({ title: "TEST DATA limpeza com ficha", displayTitle: "TEST DATA limpeza com ficha", platform: "comprasgov", platformLabel: "Compras.gov.br" })
    .where(eq(tendersTable.id, withData));
  await db
    .update(tendersTable)
    .set({ title: "TEST DATA limpeza sem ficha", displayTitle: "TEST DATA limpeza sem ficha", platform: "comprasgov", platformLabel: "Compras.gov.br" })
    .where(eq(tendersTable.id, withoutData));
  await db.update(tendersTable).set({ title: "TEST DATA ficha em processamento", displayTitle: "TEST DATA ficha em processamento" }).where(eq(tendersTable.id, processing));

  const evidence = (text: string) => ({ documentTitle: "Edital", documentUrl: "https://example.test/edital.pdf", page: 2, text });
  await db.insert(tenderAiSheetsTable).values([
    {
      id: "sheet-ready",
      tenderId: withData,
      indexVersion: 1,
      requestedModel: "test-model",
      promptVersion: 3,
      status: "ready",
      fields: [
        { id: "me_epp", status: "found", answer: "quota", confidence: 0.92, evidence: evidence("Cota reservada de 25% para ME/EPP") },
        { id: "bid_guarantee", status: "not_found", answer: null, confidence: null, evidence: null },
      ],
      qualificationChecklist: [
        { type: "qualificacao_tecnica", evidence: evidence("Atestado de capacidade técnica em limpeza"), confidence: 0.9 },
      ],
    },
    {
      id: "sheet-processing",
      tenderId: processing,
      indexVersion: 1,
      requestedModel: "test-model",
      promptVersion: 3,
      status: "processing",
      fields: [{ id: "bid_guarantee", status: "found", answer: "required", confidence: 0.9, evidence: evidence("Garantia de proposta") }],
    },
  ]);

  const subscriber = await login("highlights@example.test", true);
  const expired = await login("expired@example.test", false);
  await db.insert(companyProfilesTable).values({
    userId: subscriber.userId,
    description: "Empresa de limpeza e conservação predial",
    offerings: ["limpeza"],
    registeredPlatforms: ["bll"],
    coverageScope: "national",
    size: "me_epp",
    version: 1,
  });
  await db.insert(companyTenderFitsTable).values({
    id: "fit-ready",
    userId: subscriber.userId,
    tenderId: withData,
    profileVersion: 1,
    tenderFingerprint: "fingerprint",
    requestedModel: "test-model",
    promptVersion: 3,
    status: "ready",
    level: "high",
    score: "0.9000000",
    reasons: [{ kind: "offering_match", terms: ["limpeza"] }],
    checkedAt: new Date("2026-10-13T12:00:00Z"),
  });

  await t.test("card highlights come only from ready sheets", async () => {
    const highlights = await loadRequirementHighlights([withData, withoutData, processing]);
    assert.deepEqual([...highlights.keys()], [withData]);
    assert.deepEqual(highlights.get(withData), [
      { code: "me_epp_quota", label: "Cota reservada para ME/EPP" },
      { code: "technical_certificate", label: "Exige atestado de capacidade técnica" },
    ]);

    const ids = [withData, withoutData, processing].map((id) => `tenderIds=${encodeURIComponent(id)}`).join("&");
    const response = await request(`/v1/me/tender-highlights?${ids}`, subscriber.cookie);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      results: { [withData]: { requirements: highlights.get(withData) } },
    });
    assert.equal((await request(`/v1/me/tender-highlights?${ids}`)).status, 401);
    assert.equal((await request(`/v1/me/tender-highlights?${ids}`, expired.cookie)).status, 402);
    assert.equal((await request("/v1/me/tender-highlights", subscriber.cookie)).status, 400);
  });

  await t.test("e-mail highlights join the stored fit, sheet and registration warning", async () => {
    const highlights = await loadEmailTenderHighlights(subscriber.userId, [withData, withoutData, processing]);
    assert.deepEqual([...highlights.keys()].sort(), [withData, withoutData].sort());
    assert.deepEqual(highlights.get(withData)?.lines, [
      "Alta aderência ao seu perfil: combina com “limpeza”",
      "Cota reservada para ME/EPP · Exige atestado de capacidade técnica",
      "Disputa em Compras.gov.br: você ainda não é cadastrado nesta plataforma",
    ]);
    // No sheet and no fit: only the registration warning, which the profile already justifies.
    assert.deepEqual(highlights.get(withoutData)?.lines, [
      "Disputa em Compras.gov.br: você ainda não é cadastrado nesta plataforma",
    ]);
    assert.equal(highlights.has(processing), false);
    // Without a profile there is no fit and no registration to compare: nothing to say about these tenders.
    assert.deepEqual([...(await loadEmailTenderHighlights(expired.userId, [withoutData, processing])).keys()], []);
  });

  await t.test("the daily digest cites the saved search's tenders with their highlights", async () => {
    await db.insert(notificationsTable).values({
      id: "saved-search-highlights",
      userId: subscriber.userId,
      type: "saved_search_new_matches",
      dedupeKey: "saved-search:search-1:2026-10-14",
      createdAt: new Date("2026-10-14T08:00:00Z"),
      savedSearchId: "search-1",
      savedSearchName: "Limpeza predial",
      savedSearchQuery: "?q=limpeza",
      matchCount: 3,
      tenderIds: [processing, withData, withoutData],
    });
    const sent: EmailMessage[] = [];
    const result = await runDailyEmailDigest(new Date("2026-10-14T10:00:00Z"), async (message) => {
      sent.push(message);
      return { status: "sent", providerMessageId: `test-${sent.length}` };
    });
    assert.equal(result.sent, 1);
    const [email] = sent;
    assert.ok(email);
    assert.match(email.html, /Destaques/);
    assert.match(email.html, /TEST DATA limpeza com ficha/);
    assert.match(email.html, /Alta aderência ao seu perfil: combina com “limpeza”/);
    assert.match(email.html, /Cota reservada para ME\/EPP · Exige atestado de capacidade técnica/);
    assert.match(email.text, /você ainda não é cadastrado nesta plataforma/);
    assert.doesNotMatch(email.html, /TEST DATA ficha em processamento/);
    const [delivery] = await db.select().from(emailDeliveriesTable);
    assert.equal(delivery?.htmlBody, email.html);
  });

  await t.test("no listing or e-mail path called a model or queued a job", async () => {
    assert.deepEqual(outbound, []);
    assert.equal((await db.select({ value: count() }).from(aiJobsTable))[0]?.value, 0);
    assert.equal((await db.select({ value: count() }).from(tenderAiSheetsTable))[0]?.value, 2);
    assert.equal((await db.select({ value: count() }).from(companyTenderFitsTable))[0]?.value, 1);
    const [sheet] = await db.select().from(tenderAiSheetsTable).where(eq(tenderAiSheetsTable.id, "sheet-processing"));
    assert.equal(sheet?.status, "processing");
  });
});
