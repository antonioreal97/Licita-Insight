import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeTenderTitle } from "./title-normalizer";

type Fixture = { items: { id: number; text: string }[] };
const fixture = JSON.parse(
  await readFile(new URL("../../scripts/fixtures/title-eval-gold.json", import.meta.url), "utf8"),
) as Fixture;

const words = (value: string): string[] =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").match(/[\p{L}\d]+/gu) ?? [];
const bridges = new Set(words("Aquisição Contratação serviço de para preços Registro"));

const assertDoesNotInvent = (input: string, output: string): void => {
  const available = new Set(words(input));
  for (const word of words(output)) {
    assert.ok(available.has(word) || bridges.has(word), `palavra inventada "${word}" em "${output}"`);
  }
};

test("normaliza os 40 títulos reais com limite, privacidade, idempotência e sem inventar", () => {
  for (const item of fixture.items) {
    const result = normalizeTenderTitle(item.text);
    assert.ok(result.title.length <= 100, `item ${item.id} excedeu 100 caracteres`);
    assert.equal(normalizeTenderTitle(result.title).title, result.title, `item ${item.id} não é idempotente`);
    assertDoesNotInvent(item.text, result.title);
    assert.doesNotMatch(result.title, /^\[[^\]]+\]/u);
    assert.doesNotMatch(result.title, /\b(?:CNPJ|CPF)\b|\b[A-Z]{3}[-\s]?(?:\d{4}|\d[A-Z]\d{2})\b/iu);
  }
  const combined = fixture.items.map(({ text }) => normalizeTenderTitle(text).title).join(" ");
  assert.doesNotMatch(combined, /CAMILA RIBEIRO|GIOVANI CHERINI|ANNA CAROLINA FARIA LIRIO/iu);
});

test("preserva siglas conhecidas ao converter caixa alta em caixa de frase", () => {
  assert.equal(
    normalizeTenderTitle("AQUISIÇÃO DE EPI PARA UBS E ATENDIMENTO DO SUS").title,
    "Aquisição de EPI para UBS e atendimento do SUS",
  );
});

test("encurta fórmulas sem mudar o objeto", () => {
  assert.equal(
    normalizeTenderTitle("Registro de preços para eventual e futura aquisição de gás GLP").title,
    "Registro de preços para aquisição de gás GLP",
  );
  assert.equal(
    normalizeTenderTitle("Contratação de empresa especializada para prestação de serviços de limpeza predial").title,
    "Contratação de serviço de limpeza predial",
  );
  assert.match(normalizeTenderTitle("Aquisição emergencial de medicamentos").title, /^Aquisição emergencial/u);
});

test("sinaliza títulos longos, curtos, genéricos e com pessoa", () => {
  assert.ok(normalizeTenderTitle("Recarga de extintores").needsModel === false);
  assert.ok(normalizeTenderTitle("Objeto não informado pelo PNCP").reasons.includes("generic_title"));
  assert.ok(normalizeTenderTitle("Compra").reasons.includes("too_short"));
  assert.ok(normalizeTenderTitle("Contratação de Assistentes Sociais: CAMILA RIBEIRO DE OLIVEIRA").reasons.includes("person_name"));
});

test("invariante sem invenção cobre 200 títulos sintéticos", () => {
  for (let index = 0; index < 200; index += 1) {
    const raw = `[PORTAL ${index}] - CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA PRESTAÇÃO DE SERVIÇOS DE LIMPEZA DA UBS ${index}`;
    const result = normalizeTenderTitle(raw);
    assertDoesNotInvent(raw, result.title);
    assert.equal(normalizeTenderTitle(result.title).title, result.title);
    assert.ok(result.title.length <= 100);
  }
});

const fixtureText = (id: number): string => {
  const item = fixture.items.find((candidate) => candidate.id === id);
  assert.ok(item, `item ${id} ausente da fixture`);
  return item.text;
};

test("item 31: remove conectivo solto depois da placa e sinaliza o fragmento", () => {
  const result = normalizeTenderTitle(fixtureText(31));
  assert.equal(result.title, "Serviço de reparo em veículo do tipo ônibus m.benz/caio lo 916.ORE");
  assert.ok(result.reasons.includes("removal_fragment"));
  assert.equal(result.needsModel, true);
  assert.equal(normalizeTenderTitle("Manutenção do veículo de placa ABC1234").title, "Manutenção do veículo");
});

test("parênteses vazios deixados por uma remoção somem e marcam needsModel", () => {
  const result = normalizeTenderTitle("Reparo do caminhão (placa ABC1D23) da frota municipal");
  assert.equal(result.title, "Reparo do caminhão da frota municipal");
  assert.ok(result.reasons.includes("removal_fragment"));
});

test("conectivo final só é removido depois de remoção ou corte", () => {
  assert.equal(normalizeTenderTitle("Aquisição de vacina contra hepatite A").title, "Aquisição de vacina contra hepatite A");
});

test("item 40: corta em 'destinados a atender'", () => {
  assert.equal(normalizeTenderTitle(fixtureText(40)).title, "Material de informática");
  assert.equal(
    normalizeTenderTitle("Aquisição de cestas básicas destinadas a atender famílias carentes").title,
    "Aquisição de cestas básicas",
  );
});

test("item 26: prefixo repetido aparece uma vez só", () => {
  const title = normalizeTenderTitle(fixtureText(26)).title;
  assert.match(title, /^Contratação de serviço de manutenção e fornecimento de peças para os elevadores/u);
  assert.equal(title.match(/Contratação/gu)?.length, 1);
});

test("item 30 e similares: sem ponto final", () => {
  assert.equal(normalizeTenderTitle(fixtureText(30)).title, "Aquisição de carga e recarga de extintores de incêndio");
  assert.equal(normalizeTenderTitle("Aquisição de material de limpeza.").title, "Aquisição de material de limpeza");
  for (const item of fixture.items) {
    assert.doesNotMatch(normalizeTenderTitle(item.text).title, /(?<!\.)\.$/u, `item ${item.id} termina em ponto`);
  }
});

test("'Contratação de empresa para serviços de' vira 'Contratação de serviço de'", () => {
  assert.equal(
    normalizeTenderTitle("Contratação de empresa para serviços de coffee break").title,
    "Contratação de serviço de coffee break",
  );
  assert.equal(
    normalizeTenderTitle("Contratação de empresa para serviço de chaveiro").title,
    "Contratação de serviço de chaveiro",
  );
});
