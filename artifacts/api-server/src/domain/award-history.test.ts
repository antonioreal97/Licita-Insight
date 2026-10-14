import assert from "node:assert/strict";
import test from "node:test";
import { categorySlugsFromOfficialTitle } from "../titles/category-rules";
import {
  aggregateAwardHistory,
  classifySupplier,
  emptyAwardHistory,
  lockWinnerNames,
  objectTokens,
  tenderKeywords,
  type AwardHistoryInput,
  type AwardHistoryTender,
  type HistoryContract,
  type HistoryPurchase,
  type HistoryResult,
} from "./award-history";

const tender: AwardHistoryTender = {
  id: "11111111000111-1-000050-2026",
  title: "Aquisição de medicamentos para a farmácia básica municipal",
  objectSummary: "Registro de preços para eventual aquisição de medicamentos da farmácia básica",
  itemDescriptions: ["Dipirona sódica 500 mg comprimido", "Amoxicilina 500 mg cápsula"],
  categorySlugs: ["medicamentos-insumos-saude"],
  purchasingUnit: "Secretaria Municipal de Saúde",
};

const company = (name: string, cnpj: string) => ({ type: "PJ", identifier: cnpj, name });
const person = { type: "PF", identifier: "123.456.789-01", name: "JOAO DA SILVA" };

const contract = (key: string, overrides: Partial<HistoryContract> = {}): HistoryContract => ({
  purchaseKey: key,
  purchaseControlNumber: `${key.split("-").slice(0, 3).join("-")}/${key.split("-")[3]}`,
  object: "Aquisição de medicamentos para a farmácia básica",
  purchasingUnit: "Secretaria Municipal de Saúde",
  supplier: company("ALFA DISTRIBUIDORA LTDA", "22222222000122"),
  value: 1000,
  date: "2026-05-10",
  ...overrides,
});

const purchase = (key: string, contracts: HistoryContract[]): HistoryPurchase => ({
  key,
  controlNumber: contracts[0]!.purchaseControlNumber,
  contracts,
  linkedTender: null,
});

const result = (key: string, overrides: Partial<HistoryResult> = {}): HistoryResult => ({
  purchaseKey: key,
  supplier: company("ALFA DISTRIBUIDORA LTDA", "22222222000122"),
  totalValue: 500,
  unitValue: null,
  quantity: null,
  discountPercent: 10,
  resultDate: "2026-05-01",
  ...overrides,
});

const input = (purchases: HistoryPurchase[], results: HistoryResult[], overrides: Partial<AwardHistoryInput> = {}): AwardHistoryInput => ({
  tender,
  organizationName: "Município de Teste",
  keywords: tenderKeywords(tender),
  since: "2024-10-14",
  last12MonthsSince: "2025-10-14",
  purchases,
  results,
  classify: categorySlugsFromOfficialTitle,
  officialUrl: (control) => `https://pncp.gov.br/app/editais/${control}`,
  ...overrides,
});

test("palavras-chave ignoram termos genéricos e juntam plural e singular", () => {
  assert.deepEqual(objectTokens("Aquisição de MEDICAMENTOS e serviços"), ["medicamento"]);
  const keywords = tenderKeywords(tender);
  assert.equal(keywords[0], "medicamento");
  assert.ok(keywords.includes("farmacia"));
  assert.ok(keywords.includes("basica"));
  assert.ok(!keywords.includes("aquisicao"));
  assert.ok(!keywords.includes("registro"));
  assert.ok(keywords.length <= 8);
});

test("pessoa física, estrangeiro e fornecedor sem identidade nunca levam nome nem documento", () => {
  assert.deepEqual(classifySupplier(person), { key: "pf:12345678901", kind: "individual", name: null, cnpj: null });
  assert.equal(classifySupplier({ type: null, identifier: "12345678901", name: "MARIA" })?.kind, "individual");
  assert.equal(classifySupplier({ type: "PE", identifier: null, name: "FOREIGN LLC" })?.name, null);
  assert.equal(classifySupplier({ type: null, identifier: null, name: "SEM DOCUMENTO" })?.kind, "unidentified");
  assert.equal(classifySupplier({ type: null, identifier: null, name: null }), null);
  assert.deepEqual(classifySupplier(company("ALFA", "22.222.222/0001-22")), { key: "pj:22222222000122", kind: "company", name: "ALFA", cnpj: "22222222000122" });
});

test("agrega compras parecidas do órgão: vencedores, preço e desconto", () => {
  const p1 = "11111111000111-1-000010-2026";
  const p2 = "11111111000111-1-000020-2026";
  const p3 = "11111111000111-1-000030-2025";
  const unrelated = "11111111000111-1-000040-2026";
  const history = aggregateAwardHistory(input(
    [
      purchase(p1, [contract(p1)]),
      purchase(p2, [contract(p2, { object: "Medicamentos para farmácia hospitalar", date: "2026-03-01" })]),
      purchase(p3, [contract(p3, { object: "Fornecimento de medicamentos básicos", date: "2025-06-01", value: 900, supplier: company("ALFA DISTRIBUIDORA LTDA", "22222222000122") })]),
      purchase(unrelated, [contract(unrelated, { object: "Reforma da quadra poliesportiva", supplier: company("GAMA OBRAS LTDA", "33333333000133") })]),
    ],
    [
      result(p1, { totalValue: 400, discountPercent: 10 }),
      result(p1, { totalValue: 600, discountPercent: 20 }),
      result(p2, { supplier: company("BETA FARMA LTDA", "44444444000144"), totalValue: 300, discountPercent: 30, resultDate: "2026-02-20" }),
      result(p2, { supplier: person, totalValue: 200, discountPercent: 0, resultDate: "2026-02-20" }),
    ],
  ));

  assert.equal(history.scope, "unit");
  assert.equal(history.purchasingUnit, "Secretaria Municipal de Saúde");
  assert.deepEqual(history.purchases, { total: 3, last12Months: 2, withResults: 2 });
  assert.equal(history.winners.distinct, 3);
  assert.deepEqual(history.winners.top.map(({ name, kind, wins }) => [name, kind, wins]), [
    ["ALFA DISTRIBUIDORA LTDA", "company", 2],
    ["BETA FARMA LTDA", "company", 1],
    [null, "individual", 1],
  ]);
  // p1 = 400 + 600 (results), p2 = 300 + 200 (results), p3 = 900 (contract, no results)
  assert.deepEqual(history.prices.purchaseValue, { min: 500, median: 900, max: 1000, count: 3 });
  // zero discounts are ignored: 10, 20, 30
  assert.deepEqual(history.prices.discountPercent, { p25: 15, median: 20, p75: 25, count: 3 });
  assert.deepEqual(history.recent.map(({ date, valueSource }) => [date, valueSource]), [
    ["2026-05-01", "results"],
    ["2026-02-20", "results"],
    ["2025-06-01", "contracts"],
  ]);
  assert.equal(history.recent[0]?.officialUrl, "https://pncp.gov.br/app/editais/11111111000111-1-000010/2026");
  const serialized = JSON.stringify(history);
  assert.ok(!serialized.includes("JOAO"));
  assert.ok(!serialized.includes("12345678901"));
  assert.ok(!serialized.includes("GAMA"));
});

test("fica no órgão inteiro quando a unidade tem poucas compras parecidas e descarta as antigas", () => {
  const p1 = "11111111000111-1-000010-2026";
  const p2 = "11111111000111-1-000020-2026";
  const old = "11111111000111-1-000001-2023";
  const history = aggregateAwardHistory(input([
    purchase(p1, [contract(p1, { purchasingUnit: "Fundo Municipal de Saúde" })]),
    purchase(p2, [contract(p2)]),
    purchase(old, [contract(old, { date: "2023-01-10" })]),
  ], []));
  assert.equal(history.scope, "organization");
  assert.equal(history.purchasingUnit, null);
  assert.equal(history.purchases.total, 2);
  assert.equal(history.purchases.withResults, 0);
  assert.equal(history.prices.discountPercent, null);
});

test("uma palavra em comum só basta com a mesma categoria", () => {
  const sameCategory = "11111111000111-1-000010-2026";
  const otherCategory = "11111111000111-1-000020-2026";
  const history = aggregateAwardHistory(input([
    purchase(sameCategory, [contract(sameCategory, { object: "Seringas e medicamentos injetáveis" })]),
    purchase(otherCategory, [contract(otherCategory, { object: "Locação de imóvel para a farmácia" })]),
  ], []));
  assert.equal(history.purchases.total, 1);
  assert.equal(history.recent[0]?.purchasePncpControlNumber, "11111111000111-1-000010/2026");
});

test("o próprio edital não entra no histórico", () => {
  const history = aggregateAwardHistory(input([purchase(tender.id, [contract(tender.id)])], [result(tender.id)]));
  assert.equal(history.purchases.total, 0);
});

test("sem histórico devolve números zerados", () => {
  const history = aggregateAwardHistory(input([], []));
  assert.deepEqual(history.purchases, { total: 0, last12Months: 0, withResults: 0 });
  assert.deepEqual(history.winners, { distinct: 0, top: [] });
  assert.deepEqual(history.prices, { purchaseValue: null, discountPercent: null });
  assert.deepEqual(emptyAwardHistory(tender, "Município", [], "2024-10-14").criteria.categories, [
    { slug: "medicamentos-insumos-saude", label: "Medicamentos e insumos de saúde" },
  ]);
});

test("bloqueio de nomes remove nomes e CNPJ e mantém as contagens", () => {
  const p1 = "11111111000111-1-000010-2026";
  const history = aggregateAwardHistory(input([purchase(p1, [contract(p1)])], [result(p1)]));
  const locked = lockWinnerNames(history);
  assert.equal(locked.winners.top[0]?.wins, 1);
  assert.equal(locked.winners.top[0]?.name, null);
  assert.equal(locked.winners.top[0]?.cnpj, null);
  assert.equal(locked.recent[0]?.winners[0]?.name, null);
  assert.ok(!JSON.stringify(locked).includes("ALFA"));
  assert.ok(!JSON.stringify(locked).includes("22222222000122"));
  assert.equal(history.winners.top[0]?.name, "ALFA DISTRIBUIDORA LTDA");
});
