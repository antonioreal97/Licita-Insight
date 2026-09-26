import assert from "node:assert/strict";
import { test } from "node:test";

test("fit lexical gate uses Portuguese words and honors shadow, on and off", {
  skip: !process.env.PNCP_TEST_DATABASE_URL,
}, async () => {
  const schema = `fit_gate_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.JEV_API_KEY = "test-key";
  process.env.LOG_LEVEL = "silent";
  const {
    companyProfilesTable, companyTenderFitsTable, db, pool,
    subscriptionsTable, tendersTable, usersTable,
  } = await import("@workspace/db");
  await pool.query(`create schema "${schema}"`);
  for (const table of [
    "users", "subscriptions", "tenders", "company_profiles",
    "company_tender_fits", "ai_fit_daily_usage",
  ]) {
    await pool.query(`create table "${schema}"."${table}" (like public."${table}" including all)`);
  }
  const originalFetch = globalThis.fetch;
  let jevCalls = 0;
  globalThis.fetch = async () => {
    jevCalls += 1;
    return new Response(JSON.stringify({
      model: "jev-test",
      answers: { aderencia: { type: "score", score: 2.7, confidence: 0.9, legend: {}, probabilities: {} } },
      usage: { input_tokens: 1_100, output_tokens: 0 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const { getTenderFits, lexicalGatePasses } = await import("./company-fit-service");
    const addCase = async (suffix: string, offering: string) => {
      const userId = `U-${suffix}`;
      const tenderId = `T-${suffix}`;
      await db.insert(usersTable).values({ id: userId, email: `${suffix}@example.test` });
      await db.insert(subscriptionsTable).values({ userId, status: "active", currentPeriodEnd: new Date("2099-01-01") });
      await db.insert(tendersTable).values({
        id: tenderId, pncpControlNumber: `C-${suffix}`, title: "Execução de obra pública",
        objectSummary: "Reforma do prédio", description: "Serviços no imóvel",
        organizationId: "O1", organizationName: "Órgão", modality: "other", modalityLabel: "Outra",
        status: "open", estimatedValueStatus: "not_published", state: "SP", sourceId: `S-${suffix}`,
        sourceName: "TEST", categories: [], items: [{ id: "1", description: "cimento", quantity: null, unit: null, estimatedUnitValue: null, estimatedTotalValue: null }],
        documents: [], timeline: [], searchText: "execucao obra reforma cimento", titleNorm: "execucao obra publica",
        objectNorm: "reforma predio", itemsNorm: "cimento", organizationNorm: "orgao", otherNorm: "",
        rawPayload: {}, fetchedAt: new Date(),
      });
      await db.insert(companyProfilesTable).values({
        userId, description: "Empresa fornecedora para contratações públicas.", offerings: [offering],
        exclusions: [], coverageScope: "national", coverageStates: [], size: "me_epp", version: 1,
      });
      return { userId, tenderId };
    };

    const wordCase = await addCase("word", "obra civil");
    assert.equal(await lexicalGatePasses(wordCase.tenderId, ["obra civil"]), true);

    const shadow = await addCase("shadow", "medicamentos");
    process.env.AI_FIT_LEXICAL_GATE = "shadow";
    await getTenderFits(shadow.userId, [shadow.tenderId], { wait: true });
    const [shadowRow] = await db.select().from(companyTenderFitsTable);
    const shadowStored = await db.query.companyTenderFitsTable.findFirst({
      where: (fits, { eq }) => eq(fits.userId, shadow.userId),
    });
    assert.equal(shadowStored?.lexicalGatePass, false);
    assert.equal(shadowStored?.status, "ready");
    assert.equal(jevCalls, 1);
    assert.ok(shadowRow);

    const on = await addCase("on", "medicamentos");
    process.env.AI_FIT_LEXICAL_GATE = "on";
    const onFit = await getTenderFits(on.userId, [on.tenderId], { wait: true });
    assert.equal(jevCalls, 1);
    assert.equal(onFit.results[on.tenderId]?.level, "low");
    const onStored = await db.query.companyTenderFitsTable.findFirst({ where: (fits, { eq }) => eq(fits.userId, on.userId) });
    assert.equal(onStored?.lexicalGatePass, false);
    assert.deepEqual(onStored?.reasons, [{ kind: "no_offering_term" }]);

    const off = await addCase("off", "medicamentos");
    process.env.AI_FIT_LEXICAL_GATE = "off";
    await getTenderFits(off.userId, [off.tenderId], { wait: true });
    assert.equal(jevCalls, 2);
    const offStored = await db.query.companyTenderFitsTable.findFirst({ where: (fits, { eq }) => eq(fits.userId, off.userId) });
    assert.equal(offStored?.lexicalGatePass, null);
  } finally {
    globalThis.fetch = originalFetch;
    await pool.query(`drop schema "${schema}" cascade`);
    await pool.end();
  }
});
