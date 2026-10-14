import assert from "node:assert/strict";
import { test } from "node:test";

const VEST = 938_761_000_000;

const publication = (sequence: number, extra: Record<string, unknown>) => ({
  numeroControlePNCP: `12345678000199-1-${String(sequence).padStart(6, "0")}/2026`,
  objetoCompra: `Aquisição de zyxvalor lote ${sequence}`,
  processo: `V-${sequence}/2026`,
  numeroCompra: String(sequence),
  anoCompra: 2026,
  modalidadeId: 6,
  modalidadeNome: "Pregão eletrônico",
  situacaoCompraNome: "Divulgada no PNCP",
  dataPublicacaoPncp: "2026-10-01T09:00:00",
  dataEncerramentoProposta: "2099-10-20T17:00:00",
  valorTotalEstimado: 100,
  orcamentoSigilosoCodigo: 1,
  orgaoEntidade: { cnpj: "12345678000199", razaoSocial: "Prefeitura de Teste V" },
  unidadeOrgao: {
    nomeUnidade: "Compras",
    ufSigla: "AL",
    municipioNome: "Maceió",
    codigoIbge: "2704302",
  },
  ...extra,
});

const dispensa = { modalidadeId: 8, modalidadeNome: "Dispensa" };
const byValue = { codigo: 19, nome: "Lei 14.133/2021, Art. 75, II" };
const emergency = { codigo: 39, nome: "Lei 14.133/2021, Art. 75, VIII" };

test("valor estimado suspeito: ingestão, revisão idempotente, ordenação, filtro e facetas", {
  skip: !process.env.PNCP_TEST_DATABASE_URL,
}, async () => {
  const schema = `value_flag_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.LOG_LEVEL = "silent";
  const { db, pool, tendersTable } = await import("@workspace/db");
  const { eq, inArray } = await import("drizzle-orm");
  await pool.query(`create schema "${schema}"`);
  for (const table of ["tenders", "saved_tenders", "notifications", "job_run_audit"]) {
    await pool.query(`create table "${schema}"."${table}" (like public."${table}" including all)`);
  }
  try {
    const [
      { upsertPublications },
      { reviewEstimatedValues, runEstimatedValueReview },
      { PostgresTenderRepository },
    ] = await Promise.all([
      import("./upsert-tenders"),
      import("./estimated-value-review"),
      import("../repositories/postgres-tender-repository"),
    ]);

    const rows = [
      publication(940001, { ...dispensa, amparoLegal: byValue, valorTotalEstimado: VEST }),
      publication(940002, { modalidadeId: 4, modalidadeNome: "Concorrência - Eletrônica", valorTotalEstimado: 24_000_000_000 }),
      publication(940003, { ...dispensa, amparoLegal: emergency, valorTotalEstimado: 12_000_000 }),
      publication(940004, { ...dispensa, amparoLegal: byValue, valorTotalEstimado: 126_000_000 }),
      publication(940005, { modalidadeId: 9, modalidadeNome: "Inexigibilidade", valorTotalEstimado: 10_700_000_000 }),
      publication(940006, { valorTotalEstimado: 5_250_000_000 }),
      publication(940007, { valorTotalEstimado: 48_500.5 }),
      publication(940008, { valorTotalEstimado: null }),
      publication(940009, { valorTotalEstimado: VEST, orcamentoSigilosoCodigo: 2 }),
    ];
    const ids = rows.map(({ numeroControlePNCP }) => numeroControlePNCP.replaceAll("/", "-"));
    const [vest, concession, emergencyDispensa, byValueDispensa, busPasses, weeding, ordinary, unpublished, confidential] =
      ids as [string, string, string, string, string, string, string, string, string];
    await upsertPublications(rows, new Date("2026-10-02T12:00:00Z"));

    const flags = async () =>
      Object.fromEntries(
        (await db
          .select({ id: tendersTable.id, flag: tendersTable.estimatedValueFlag })
          .from(tendersTable)
          .where(inArray(tendersTable.id, ids)))
          .map((row) => [row.id, row.flag]),
      );
    const expected = {
      [vest]: "absolute_ceiling",
      [concession]: null,
      [emergencyDispensa]: null,
      [byValueDispensa]: "dispensa_legal_limit",
      [busPasses]: "modality_outlier",
      [weeding]: null,
      [ordinary]: null,
      [unpublished]: null,
      [confidential]: null,
    };
    assert.deepEqual(await flags(), expected, "the ingest flags what it collects");
    const [stored] = await db.select().from(tendersTable).where(eq(tendersTable.id, vest));
    assert.equal(stored?.estimatedValue, "938761000000.00", "the official value is kept as published");

    // The source corrects the value: the next collection clears the flag.
    await upsertPublications(
      [publication(940004, { ...dispensa, amparoLegal: byValue, valorTotalEstimado: 126_000 })],
      new Date("2026-10-03T12:00:00Z"),
    );
    assert.equal((await flags())[byValueDispensa], null);
    await upsertPublications([rows[3]!], new Date("2026-10-04T12:00:00Z"));
    assert.deepEqual(await flags(), expected);

    // History collected before the flag existed, plus a flag left behind by older limits.
    await db.update(tendersTable).set({ estimatedValueFlag: null });
    await db.update(tendersTable).set({ estimatedValueFlag: "modality_outlier" }).where(eq(tendersTable.id, concession));
    assert.deepEqual(
      await reviewEstimatedValues({ batch: 2, pauseMs: 0, shouldStop: () => true }),
      { batches: 0, scanned: 0, updated: 0, stopped: true },
      "a stop request ends the walk before the next batch",
    );
    // Only the five tenders at or above the review floor are read: the confidential one stores no value.
    assert.deepEqual(
      await reviewEstimatedValues({ batch: 2, pauseMs: 0 }),
      { batches: 3, scanned: 5, updated: 4, stopped: false },
    );
    assert.deepEqual(await flags(), expected);
    assert.deepEqual(
      await reviewEstimatedValues({ batch: 2, pauseMs: 0 }),
      { batches: 3, scanned: 5, updated: 0, stopped: false },
      "a second run writes nothing",
    );
    await db.update(tendersTable).set({ estimatedValueFlag: null }).where(eq(tendersTable.id, vest));
    process.env.ESTIMATED_VALUE_REVIEW_BATCH_SIZE = "5000";
    assert.deepEqual(await runEstimatedValueReview("test"), { batches: 1, scanned: 5, updated: 1, stopped: false });
    assert.deepEqual(await runEstimatedValueReview("test"), { batches: 1, scanned: 5, updated: 0, stopped: false });
    delete process.env.ESTIMATED_VALUE_REVIEW_BATCH_SIZE;
    const audit = await pool.query<{ status: string }>(
      "select status from job_run_audit where job_key = 'tender_estimated_value_review' order by id",
    );
    assert.deepEqual(audit.rows.map(({ status }) => status), ["succeeded", "succeeded"]);
    assert.deepEqual(await flags(), expected);

    // The review reads its candidates from the partial index, not from the whole table. The copied table
    // names its indexes after their columns, so the index is found by its predicate.
    const reviewIndex = await pool.query<{ indexname: string }>(
      "select indexname from pg_indexes where schemaname = $1 and indexdef like '%WHERE (estimated_value >= %'",
      [schema],
    );
    assert.equal(reviewIndex.rows.length, 1);
    const client = await pool.connect();
    try {
      await client.query("set enable_seqscan = off");
      const plan = await client.query<{ "QUERY PLAN": string }>(
        `explain select id from tenders where id > '' and estimated_value >= 100000000 order by id limit 1000`,
      );
      assert.ok(plan.rows.map((row) => row["QUERY PLAN"]).join("\n").includes(` on ${reviewIndex.rows[0]!.indexname} `));
    } finally {
      client.release();
    }

    const repository = new PostgresTenderRepository();
    const criteria = {
      query: "zyxvalor",
      mode: "keyword" as const,
      status: [],
      modality: [],
      state: [],
      city: [],
      organizationId: [],
      sourceId: [],
      category: [],
      platform: [],
      newOnly: false,
      sort: "value_desc" as const,
      page: 1,
      pageSize: 20,
      facets: true,
    };
    const descending = await repository.search(criteria);
    assert.deepEqual(
      descending.data.map(({ id }) => id),
      [concession, weeding, emergencyDispensa, ordinary, unpublished, confidential, vest, busPasses, byValueDispensa],
      "plausible values first, then the tenders without a value, then the flagged ones",
    );
    const ascending = await repository.search({ ...criteria, sort: "value_asc" });
    assert.deepEqual(
      ascending.data.map(({ id }) => id),
      [ordinary, emergencyDispensa, weeding, concession, unpublished, confidential, byValueDispensa, busPasses, vest],
    );
    assert.equal(descending.pagination.total, 9, "flagged tenders stay in the results");
    assert.equal(descending.data.find(({ id }) => id === vest)?.estimatedValue, VEST);
    assert.equal(descending.data.find(({ id }) => id === vest)?.estimatedValueFlag, "absolute_ceiling");
    assert.equal(descending.data.find(({ id }) => id === concession)?.estimatedValueFlag, null);
    assert.equal((await repository.findById(busPasses))?.estimatedValueFlag, "modality_outlier");

    // Both facet paths (one combined query, and one query per group) leave the flagged values out.
    assert.deepEqual(descending.facets?.valueRange.min, 48_500.5);
    assert.deepEqual(descending.facets?.valueRange.max, 24_000_000_000);
    assert.equal(descending.facets?.valueRange.histogram?.reduce((total, { count }) => total + count, 0), 4);
    const perGroup = await repository.search({ ...criteria, status: ["open"] });
    assert.deepEqual(perGroup.facets?.valueRange.max, 24_000_000_000);
    assert.equal(perGroup.facets?.valueRange.histogram?.reduce((total, { count }) => total + count, 0), 4);

    // A flagged value is unknown: it matches no value range, like a missing one.
    const large = await repository.search({ ...criteria, valueMin: 1_000_000_000 });
    assert.deepEqual(large.data.map(({ id }) => id), [concession, weeding]);
    assert.equal(large.pagination.total, 2);
    assert.deepEqual(large.facets?.valueRange.max, 24_000_000_000, "the value facet ignores its own filter");
    const small = await repository.search({ ...criteria, valueMax: 200_000_000 });
    assert.deepEqual(small.data.map(({ id }) => id), [emergencyDispensa, ordinary]);
  } finally {
    await pool.query(`drop schema "${schema}" cascade`);
    await pool.end();
  }
});
