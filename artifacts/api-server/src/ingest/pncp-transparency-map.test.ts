import assert from "node:assert/strict";
import test from "node:test";
import { mapPncpContract, mapPncpItemResult, publicSupplierIdentifier } from "./pncp-transparency-map";

const purchase = "37344371000109-1-000079/2026";
const identity = { cnpj: "37344371000109", ano: 2026, sequencial: 79 };

test("contract mapping keeps PNCP purchase provenance and does not invent values", () => {
  const row = mapPncpContract({
    numeroControlePNCP: "37344371000109-2-000115/2026",
    numeroControlePncpCompra: purchase,
    orgaoEntidade: { razaoSocial: "Prefeitura" },
    unidadeOrgao: { ufNome: "São Paulo", ufSigla: "SP" },
    tipoPessoa: "PJ",
    niFornecedor: "10.620.182/0001-57",
    nomeRazaoSocialFornecedor: "Fornecedor Teste",
    valorInicial: 1905.6,
  }, new Date("2026-10-05T00:00:00Z"));
  assert.equal(row.purchaseTenderKey, "37344371000109-1-000079-2026");
  assert.equal(row.initialValue, "1905.6000");
  assert.equal(row.globalValue, null);
  assert.equal(row.state, "SP");
  assert.equal(row.officialUrl, "https://pncp.gov.br/app/contratos/37344371000109/2026/115");
  assert.equal(publicSupplierIdentifier(row.supplierType, row.supplierIdentifier), "10620182000157");
  assert.equal(publicSupplierIdentifier("PF", "12345678901"), null);
  assert.equal(publicSupplierIdentifier("PE", "12345678901234"), null);
  assert.equal(publicSupplierIdentifier("PJ", "12345678901"), null);
});

test("cancelled item result is retained but cannot be shown as active winner", () => {
  const active = mapPncpItemResult({
    record: { numeroItem: 1, sequencialResultado: 1, situacaoCompraItemResultadoId: 1, tipoPessoa: "PJ", niFornecedor: "10620182000157", valorUnitarioHomologado: 12.5 },
    purchasePncpControlNumber: purchase, identity, itemNumber: 1,
  }, new Date("2026-10-05T00:00:00Z"));
  const cancelled = mapPncpItemResult({
    record: { numeroItem: 1, sequencialResultado: 1, situacaoCompraItemResultadoId: 2, motivoCancelamento: "Retificado" },
    purchasePncpControlNumber: purchase, identity, itemNumber: 1,
  }, new Date("2026-10-06T00:00:00Z"));
  assert.equal(active.isActive, true);
  assert.equal(active.unitValueHomologated, "12.5000");
  assert.equal(cancelled.id, active.id);
  assert.equal(cancelled.isActive, false);
  assert.equal(cancelled.cancelReason, "Retificado");
  const unknown = mapPncpItemResult({ record: { numeroItem: 1, sequencialResultado: 2 }, purchasePncpControlNumber: purchase, identity, itemNumber: 1 }, new Date());
  assert.equal(unknown.isActive, false);
});
