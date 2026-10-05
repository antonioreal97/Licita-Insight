import assert from "node:assert/strict";
import test from "node:test";

test("transparency upsert replaces a PNCP contract retification", { skip: !process.env.DATABASE_URL }, async () => {
  const { db, pncpContractsTable, pncpItemResultsTable, tendersTable, pool } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const { upsertPncpContracts, upsertPncpItemResults } = await import("./upsert-transparency");
  const { searchTransparencyContracts, tenderTransparency } = await import("../repositories/postgres-transparency-repository");
  const { parseControlNumber, tenderIdFromControlNumber } = await import("./pncp-map");
  const contractControl = "99999999000199-2-999999/2099";
  const purchaseControl = "99999999000199-1-999999/2099";
  const tenderId = tenderIdFromControlNumber(purchaseControl);
  const record = {
    numeroControlePNCP: contractControl,
    numeroControlePncpCompra: purchaseControl,
    orgaoEntidade: { razaoSocial: "Orgao de teste" },
    tipoPessoa: "PJ", niFornecedor: "99999999000199", nomeRazaoSocialFornecedor: "Original",
    valorInicial: 10,
  };
  try {
    await upsertPncpContracts([record], new Date());
    const checkedAt = new Date("2026-10-05T12:00:00Z");
    await db.update(pncpContractsTable).set({ resultsCheckedAt: checkedAt })
      .where(eq(pncpContractsTable.pncpControlNumber, contractControl));
    await upsertPncpContracts([{ ...record, nomeRazaoSocialFornecedor: "Retificado", valorInicial: 20 }], new Date());
    const [stored] = await db.select().from(pncpContractsTable).where(eq(pncpContractsTable.pncpControlNumber, contractControl));
    assert.equal(stored.supplierName, "Retificado");
    assert.equal(stored.initialValue, "20.0000");
    assert.equal(stored.resultsCheckedAt?.toISOString(), checkedAt.toISOString());
    const page = await searchTransparencyContracts({ query: "Retificado", state: null, page: 1, pageSize: 10, sort: "published_desc" });
    assert.equal(page.pagination.total, 1);
    assert.equal(page.data[0]?.supplier?.name, "Retificado");
    assert.ok(page.meta.indexUpdatedAt === null || page.meta.indexUpdatedAt.endsWith("Z"));
    await db.insert(tendersTable).values({
      id: tenderId, pncpControlNumber: purchaseControl, title: "Edital de teste",
      organizationId: "99999999000199", organizationName: "Orgao de teste",
      modality: "pregao", modalityLabel: "Pregao", status: "published",
      estimatedValueStatus: "not_published", sourceId: "pncp", sourceName: "PNCP",
      searchText: "edital de teste", titleNorm: "edital de teste", objectNorm: "",
      itemsNorm: "", organizationNorm: "orgao de teste", otherNorm: "",
      rawPayload: {}, fetchedAt: new Date(),
    });
    const identity = parseControlNumber(purchaseControl);
    assert.ok(identity);
    await upsertPncpItemResults({
      records: [{ numeroItem: 1, sequencialResultado: 1, situacaoCompraItemResultadoId: 1,
        tipoPessoa: "PF", niFornecedor: "12345678901", nomeRazaoSocialFornecedor: "Pessoa Teste",
        valorTotalHomologado: 25 }],
      purchasePncpControlNumber: purchaseControl, identity, itemNumber: 1, fetchedAt: new Date(),
    });
    const linked = await tenderTransparency(tenderId);
    assert.equal(linked?.contracts[0]?.pncpControlNumber, contractControl);
    assert.equal(linked?.results[0]?.values.totalValueHomologated, 25);
    assert.equal(linked?.results[0]?.supplier?.identifier, null);
    const linkedSearch = await searchTransparencyContracts({ query: "Retificado", state: null, page: 1, pageSize: 10, sort: "published_desc" });
    assert.equal(linkedSearch.data[0]?.tenderId, tenderId);
  } finally {
    await db.delete(pncpItemResultsTable).where(eq(pncpItemResultsTable.purchaseTenderKey, tenderId));
    await db.delete(pncpContractsTable).where(eq(pncpContractsTable.pncpControlNumber, contractControl));
    await db.delete(tendersTable).where(eq(tendersTable.id, tenderId));
    await pool.end();
  }
});
