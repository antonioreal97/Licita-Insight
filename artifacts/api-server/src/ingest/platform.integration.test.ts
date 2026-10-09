import assert from "node:assert/strict";
import { test } from "node:test";

const publication = (sequence: number, extra: Record<string, unknown>) => ({
  numeroControlePNCP: `98765432000199-1-${String(sequence).padStart(6, "0")}/2026`,
  objetoCompra: `Aquisição de zyxplataforma lote ${sequence}`,
  processo: `P-${sequence}/2026`,
  numeroCompra: String(sequence),
  anoCompra: 2026,
  modalidadeId: 6,
  modalidadeNome: "Pregão eletrônico",
  situacaoCompraNome: "Divulgada no PNCP",
  dataPublicacaoPncp: "2026-10-01T09:00:00",
  dataEncerramentoProposta: "2026-10-20T17:00:00",
  valorTotalEstimado: 100,
  orcamentoSigilosoCodigo: 1,
  orgaoEntidade: { cnpj: "98765432000199", razaoSocial: "Prefeitura de Teste P" },
  unidadeOrgao: {
    nomeUnidade: "Compras",
    ufSigla: "SP",
    municipioNome: "São Paulo",
    codigoIbge: "3550308",
  },
  ...extra,
});

test("plataforma: ingest, backfill idempotente, filtro com contagem e perfil", {
  skip: !process.env.PNCP_TEST_DATABASE_URL,
}, async () => {
  const schema = `platform_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.LOG_LEVEL = "silent";
  const { companyProfilesTable, db, pool, tendersTable, usersTable } = await import("@workspace/db");
  const { eq, inArray } = await import("drizzle-orm");
  await pool.query(`create schema "${schema}"`);
  for (const table of ["users", "tenders", "company_profiles", "company_tender_fits", "job_run_audit"]) {
    await pool.query(`create table "${schema}"."${table}" (like public."${table}" including all)`);
  }
  try {
    const [{ upsertPublications }, { backfillTenderPlatforms, runTenderPlatformBackfill }, { PostgresTenderRepository }, { putCompanyProfile }] =
      await Promise.all([
        import("./upsert-tenders"),
        import("./platform-backfill"),
        import("../repositories/postgres-tender-repository"),
        import("../ai/company-fit-service"),
      ]);
    const rows = [
      publication(930001, { usuarioNome: "BLL Compras" }),
      publication(930002, { usuarioNome: "Licitanet Licitações Eletrônicas LTDA" }),
      publication(930003, { usuarioNome: "IPM Sistemas" }),
      publication(930004, {}),
    ];
    await upsertPublications(rows, new Date("2026-10-02T12:00:00Z"));
    const ids = rows.map(({ numeroControlePNCP }) => numeroControlePNCP.replaceAll("/", "-"));
    const platforms = async () =>
      Object.fromEntries(
        (await db
          .select({ id: tendersTable.id, platform: tendersTable.platform, label: tendersTable.platformLabel })
          .from(tendersTable)
          .where(inArray(tendersTable.id, ids)))
          .map((row) => [row.id, `${row.platform}|${row.label}`]),
      );
    const expected = {
      [ids[0]!]: "bll|BLL Compras",
      [ids[1]!]: "licitanet|Licitanet",
      [ids[2]!]: "origem-ipm-sistemas|Sistema de origem: IPM Sistemas",
      [ids[3]!]: "nao-informado|Sistema não informado",
    };
    assert.deepEqual(await platforms(), expected);

    await db.update(tendersTable).set({ platform: null, platformLabel: null });
    const run = async () => (await backfillTenderPlatforms({ batch: 2, pauseMs: 0 })).updated;
    assert.deepEqual(
      await backfillTenderPlatforms({ batch: 2, pauseMs: 0, shouldStop: () => true }),
      { batches: 0, scanned: 0, updated: 0, stopped: true },
      "a stop request ends the walk before the next batch",
    );
    assert.deepEqual(await backfillTenderPlatforms({ batch: 2, pauseMs: 0 }), { batches: 2, scanned: 4, updated: 4, stopped: false });
    assert.deepEqual(await platforms(), expected);
    await db.update(tendersTable).set({ platform: "bnc", platformLabel: "BNC (Bolsa Nacional de Compras)" })
      .where(eq(tendersTable.id, ids[3]!));
    assert.equal(await run(), 0, "second run touches nothing");
    assert.equal(await runTenderPlatformBackfill("test"), null, "the scheduled job skips when no tender lacks platform");
    await db.update(tendersTable).set({ platform: null, platformLabel: null }).where(eq(tendersTable.id, ids[0]!));
    process.env.PLATFORM_BACKFILL_BATCH_SIZE = "2";
    assert.deepEqual(await runTenderPlatformBackfill("test"), { batches: 1, scanned: 1, updated: 1, stopped: false });
    delete process.env.PLATFORM_BACKFILL_BATCH_SIZE;
    const audit = await pool.query<{ status: string }>(
      "select status from job_run_audit where job_key = 'tender_platform_backfill'",
    );
    assert.deepEqual(audit.rows.map(({ status }) => status), ["succeeded"]);
    assert.equal((await platforms())[ids[3]!], "bnc|BNC (Bolsa Nacional de Compras)");
    await db.update(tendersTable).set({ platform: "nao-informado", platformLabel: "Sistema não informado" })
      .where(eq(tendersTable.id, ids[3]!));

    const repository = new PostgresTenderRepository();
    const criteria = {
      query: "zyxplataforma",
      mode: "keyword" as const,
      status: [],
      modality: [],
      state: [],
      city: [],
      organizationId: [],
      sourceId: [],
      category: [],
      platform: ["bll", "licitanet"],
      newOnly: false,
      sort: "relevance" as const,
      page: 1,
      pageSize: 20,
      facets: true,
    };
    const result = await repository.search(criteria);
    assert.deepEqual(result.data.map(({ id }) => id).sort(), [ids[0], ids[1]]);
    assert.deepEqual(result.data.find(({ id }) => id === ids[1])?.platform, {
      slug: "licitanet",
      label: "Licitanet",
      kind: "platform",
      url: "https://licitanet.com.br",
    });
    assert.deepEqual(
      result.facets?.platform.map(({ value, count }) => `${value}:${count}`).sort(),
      ["bll:1", "licitanet:1", "nao-informado:1", "origem-ipm-sistemas:1"],
      "the platform facet ignores its own filter",
    );
    assert.equal(result.facets?.groupTotals?.platform, 4);

    const userId = "U-platform";
    await db.insert(usersTable).values({ id: userId, email: "platform@example.test" });
    const input = {
      description: "Fornecemos computadores e suporte técnico especializado.",
      offerings: ["computadores"],
      exclusions: [],
      selectedCategories: [],
      selectedKeywords: [],
      excludedKeywords: [],
      registeredPlatforms: ["sicaf"],
      coverage: { scope: "national" as const, mode: "strict" as const, acceptsRemote: false },
      valueRange: { min: null, max: null },
      size: "other" as const,
    };
    const first = await putCompanyProfile(userId, input);
    const onlyPlatforms = await putCompanyProfile(userId, { ...input, registeredPlatforms: ["sicaf", "licitanet"] });
    assert.equal(onlyPlatforms.version, first.version, "platforms alone keep the fit version");
    assert.deepEqual(onlyPlatforms.registeredPlatforms, ["sicaf", "licitanet"]);
    const changed = await putCompanyProfile(userId, {
      ...input,
      registeredPlatforms: ["sicaf", "licitanet"],
      description: `${input.description} Também redes.`,
    });
    assert.equal(changed.version, first.version + 1);
    const [stored] = await db.select().from(companyProfilesTable).where(eq(companyProfilesTable.userId, userId));
    assert.deepEqual(stored?.registeredPlatforms, ["sicaf", "licitanet"]);
  } finally {
    await pool.query(`drop schema "${schema}" cascade`);
    await pool.end();
  }
});
