import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";

// Opt-in: real Postgres with the application migrations applied (see docs/account-api.md).
test("award history with PostgreSQL", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  process.env.DATABASE_URL = process.env.PNCP_TEST_DATABASE_URL;
  process.env.PUBLIC_APP_ORIGIN = "http://localhost:24252";
  process.env.AUTH_DEV_LOGIN = "true";
  process.env.SESSION_SECRET = "award-history-integration-secret-32-characters";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.RATE_LIMIT_AUTH_PER_MINUTE = "1000";
  delete process.env.BILLING_DEV_ENTITLED;

  const { db, pool, pncpContractsTable, pncpItemResultsTable, subscriptionsTable, tendersTable, usersTable } = await import("@workspace/db");
  const { eq, inArray, like } = await import("drizzle-orm");
  const { clearAwardHistoryCache, purchaseKeyRange } = await import("./postgres-award-history-repository");
  const { default: app } = await import("../app");
  const { GetTenderAwardHistoryResponse } = await import("@workspace/api-zod");

  // Adjacent CNPJs: the key range of one must not reach the other.
  const orgA = "88888888000188";
  const orgB = "88888888000189";
  const orgC = "88888888000190";
  const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
  const control = (cnpj: string, sequence: number, year = 2026) => `${cnpj}-1-${String(sequence).padStart(6, "0")}/${year}`;
  const key = (value: string) => value.replace("/", "-");
  const target = control(orgA, 900);
  const lonely = control(orgC, 901);
  const emails = ["award-paid@example.test", "award-free@example.test"];

  const tender = (controlNumber: string, title: string, organizationId: string, categories: { slug: string; label: string }[]) => ({
    id: key(controlNumber), pncpControlNumber: controlNumber, title,
    organizationId: `pncp-${organizationId}`, organizationName: "Município de Teste", purchasingUnit: "Secretaria Municipal de Saúde",
    modality: "pregao", modalityLabel: "Pregão", status: "open", estimatedValueStatus: "not_published",
    sourceId: "pncp", sourceName: "PNCP", searchText: title.toLowerCase(), titleNorm: title.toLowerCase(),
    objectNorm: "", itemsNorm: "", organizationNorm: "municipio de teste", otherNorm: "", categories,
    items: [{ id: "1", description: "Dipirona sódica 500 mg", quantity: 10, unit: "un", estimatedUnitValue: null, estimatedTotalValue: null }],
    rawPayload: {}, fetchedAt: new Date(),
  });
  const contract = (purchase: string, sequence: number, object: string, supplier: { type: string; id: string; name: string }, signed: string, value: number) => {
    const [cnpj, , , year] = key(purchase).split("-");
    const contractControl = `${cnpj}-2-${String(sequence).padStart(6, "0")}/${year}`;
    return {
      id: key(contractControl), pncpControlNumber: contractControl, purchasePncpControlNumber: purchase, purchaseTenderKey: key(purchase),
      cnpj: cnpj!, year: Number(year), sequence, organizationName: "Município de Teste", purchasingUnit: "Secretaria Municipal de Saúde",
      supplierType: supplier.type, supplierIdentifier: supplier.id, supplierName: supplier.name, object,
      globalValue: String(value), signatureDate: signed,
      searchText: `${object} ${supplier.name} municipio de teste`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(),
      rawPayload: {}, fetchedAt: new Date(),
    };
  };
  const result = (purchase: string, item: number, supplier: { type: string; id: string; name: string }, total: number, discount: number | null, date: string, active = true) => {
    const [cnpj, , sequence, year] = key(purchase).split("-");
    return {
      id: `${key(purchase)}-item-${item}-result-1`, purchasePncpControlNumber: purchase, purchaseTenderKey: key(purchase),
      cnpj: cnpj!, purchaseYear: Number(year), purchaseSequence: Number(sequence), itemNumber: item, resultSequence: 1,
      statusId: active ? 1 : 4, statusName: active ? "Informado" : "Cancelado", isActive: active,
      supplierType: supplier.type, supplierIdentifier: supplier.id, supplierName: supplier.name,
      totalValueHomologated: String(total), discountPercent: discount === null ? null : String(discount), resultDate: date,
      rawPayload: {}, fetchedAt: new Date(),
    };
  };
  const alfa = { type: "PJ", id: "22222222000122", name: "ALFA DISTRIBUIDORA LTDA" };
  const beta = { type: "PJ", id: "44444444000144", name: "BETA FARMA LTDA" };
  const gama = { type: "PJ", id: "33333333000133", name: "GAMA OBRAS LTDA" };
  const delta = { type: "PJ", id: "55555555000155", name: "DELTA OUTRO ORGAO LTDA" };
  const person = { type: "PF", id: "12345678901", name: "JOAO DA SILVA" };
  const medicines = [{ slug: "medicamentos-insumos-saude", label: "Medicamentos e insumos de saúde" }];
  const p1 = control(orgA, 10);
  const p2 = control(orgA, 20);
  const p3 = control(orgA, 30, 2025);
  const unrelated = control(orgA, 40);
  const tooOld = control(orgA, 50, 2023);
  const otherOrg = control(orgB, 60);

  const cleanup = async () => {
    await db.delete(pncpItemResultsTable).where(like(pncpItemResultsTable.purchaseTenderKey, "888888880001%"));
    await db.delete(pncpContractsTable).where(like(pncpContractsTable.purchaseTenderKey, "888888880001%"));
    await db.delete(tendersTable).where(like(tendersTable.id, "888888880001%"));
    await db.delete(usersTable).where(inArray(usersTable.email, emails));
  };
  await cleanup();
  await db.insert(tendersTable).values([
    tender(target, "Aquisição de medicamentos para a farmácia básica", orgA, medicines),
    tender(lonely, "Aquisição de medicamentos para a farmácia básica", orgC, medicines),
    tender(p1, "Medicamentos da farmácia básica 2026", orgA, medicines),
  ]);
  await db.insert(pncpContractsTable).values([
    contract(p1, 1, "Aquisição de medicamentos para a farmácia básica", alfa, day(40), 1000),
    contract(p2, 2, "Medicamentos para farmácia hospitalar", beta, day(200), 600),
    contract(p3, 3, "Fornecimento de medicamentos básicos", alfa, day(500), 900),
    contract(unrelated, 4, "Reforma da quadra poliesportiva e farmácia", gama, day(30), 5000),
    contract(tooOld, 5, "Medicamentos da farmácia básica", gama, day(900), 700),
    contract(otherOrg, 6, "Medicamentos da farmácia básica", delta, day(20), 800),
    contract(target, 7, "Medicamentos da farmácia básica", delta, day(10), 800),
  ]);
  await db.insert(pncpItemResultsTable).values([
    result(p1, 1, alfa, 400, 10, day(45)),
    result(p1, 2, alfa, 600, 20, day(45)),
    result(p2, 1, beta, 300, 30, day(210)),
    result(p2, 2, person, 200, null, day(210)),
    result(p2, 3, gama, 999, 50, day(210), false),
  ]);
  clearAwardHistoryCache();

  const server: Server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await cleanup();
    await pool.end();
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, cookie?: string) => fetch(`${baseUrl}/api${path}`, { headers: cookie ? { Cookie: cookie } : {} });
  const login = async (email: string, subscribed: boolean) => {
    const response = await fetch(`${baseUrl}/api/v1/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:24252", "X-Requested-With": "licita-insight" },
      body: JSON.stringify({ email, name: "TEST USER" }),
    });
    assert.equal(response.status, 204);
    const cookie = response.headers.get("set-cookie")!.split(";", 1)[0]!;
    const session = await (await request("/v1/auth/session", cookie)).json() as { user: { id: string } };
    if (subscribed) {
      await db.insert(subscriptionsTable).values({ userId: session.user.id, status: "active", currentPeriodEnd: new Date("2099-01-01T00:00:00Z") });
    }
    return cookie;
  };
  type Body = {
    data: {
      scope: string;
      purchases: { total: number; last12Months: number; withResults: number };
      winners: { distinct: number; top: { name: string | null; cnpj: string | null; kind: string; wins: number }[] };
      prices: { purchaseValue: { min: number; median: number; max: number; count: number } | null; discountPercent: { median: number; count: number } | null };
      recent: { purchasePncpControlNumber: string; tenderId: string | null; winners: { name: string | null }[]; officialUrl: string | null }[];
      criteria: { keywords: string[] };
    };
    meta: { access: { winnerNames: string; unlocked: boolean } };
  };

  await t.test("the key range stays inside one organization and uses the purchase key index", async () => {
    const rows = await db.select({ key: pncpContractsTable.purchaseTenderKey }).from(pncpContractsTable)
      .where(purchaseKeyRange(pncpContractsTable.purchaseTenderKey, orgA));
    assert.ok(rows.length > 0);
    assert.ok(rows.every(({ key: value }) => value.startsWith(`${orgA}-`)));
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local enable_seqscan = off");
      const plan = await client.query<{ "QUERY PLAN": string }>(
        `explain select id from pncp_contracts where purchase_tender_key >= $1 and purchase_tender_key < $2 and purchase_tender_key like $3`,
        [orgA, orgB, `${orgA}-%`],
      );
      assert.match(plan.rows.map((row) => row["QUERY PLAN"]).join("\n"), /pncp_contracts_purchase_tender_key_idx/);
      await client.query("rollback");
    } finally {
      client.release();
    }
  });

  await t.test("anonymous viewers get the aggregate numbers without names", async () => {
    const response = await request(`/v1/tenders/${key(target)}/award-history`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /public/);
    const body = await response.json() as Body;
    GetTenderAwardHistoryResponse.parse(body);
    assert.deepEqual(body.meta.access, { winnerNames: "entitled", unlocked: false });
    assert.equal(body.data.scope, "unit");
    assert.deepEqual(body.data.purchases, { total: 3, last12Months: 2, withResults: 2 });
    assert.equal(body.data.winners.distinct, 3);
    assert.deepEqual(body.data.winners.top.map(({ name, cnpj, kind, wins }) => [name, cnpj, kind, wins]), [
      [null, null, "company", 2],
      [null, null, "company", 1],
      [null, null, "individual", 1],
    ]);
    assert.deepEqual(body.data.prices.purchaseValue, { min: 500, median: 900, max: 1000, count: 3 });
    assert.deepEqual(body.data.prices.discountPercent, { p25: 15, median: 20, p75: 25, count: 3 });
    assert.equal(body.data.recent[0]?.tenderId, key(p1));
    assert.equal(body.data.recent[0]?.officialUrl, `https://pncp.gov.br/app/editais/${orgA}/2026/10`);
    const text = JSON.stringify(body);
    for (const hidden of ["ALFA", "BETA", "JOAO", "12345678901", "GAMA", "DELTA", "22222222000122"]) assert.ok(!text.includes(hidden), hidden);
  });

  await t.test("viewers with active access see company names, never the natural person", async () => {
    const cookie = await login(emails[0]!, true);
    const response = await request(`/v1/tenders/${key(target)}/award-history`, cookie);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /private/);
    const body = await response.json() as Body;
    GetTenderAwardHistoryResponse.parse(body);
    assert.equal(body.meta.access.unlocked, true);
    assert.deepEqual(body.data.winners.top.map(({ name, cnpj }) => [name, cnpj]), [
      ["ALFA DISTRIBUIDORA LTDA", "22222222000122"],
      ["BETA FARMA LTDA", "44444444000144"],
      [null, null],
    ]);
    const text = JSON.stringify(body);
    for (const hidden of ["JOAO", "12345678901", "GAMA", "DELTA"]) assert.ok(!text.includes(hidden), hidden);
  });

  await t.test("signed-in viewers without access stay locked", async () => {
    const cookie = await login(emails[1]!, false);
    // A new account starts a 7-day trial, which counts as access: end it.
    await db.update(usersTable).set({ trialEndsAt: new Date(Date.now() - 1_000) }).where(eq(usersTable.email, emails[1]!));
    const body = await (await request(`/v1/tenders/${key(target)}/award-history`, cookie)).json() as Body;
    assert.equal(body.meta.access.unlocked, false);
    assert.ok(body.data.winners.top.every(({ name }) => name === null));
  });

  await t.test("a tender without history and an unknown tender", async () => {
    const empty = await (await request(`/v1/tenders/${key(lonely)}/award-history`)).json() as Body;
    GetTenderAwardHistoryResponse.parse(empty);
    assert.deepEqual(empty.data.purchases, { total: 0, last12Months: 0, withResults: 0 });
    assert.deepEqual(empty.data.winners.top, []);
    assert.ok(empty.data.criteria.keywords.includes("medicamento"));
    assert.equal((await request("/v1/tenders/does-not-exist/award-history")).status, 404);
  });
});
