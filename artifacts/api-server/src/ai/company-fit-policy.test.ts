import assert from "node:assert/strict";
import { test } from "node:test";
import { InvalidParameterError } from "../lib/api-error";
import {
  companyFitTenderFingerprint,
  fitLevel,
  parseCompanyProfileInput,
} from "./company-fit-policy";
import { fitLexicalGateMode } from "./fit-lexical-gate";

const valid = () => ({
  description:
    "Fornecemos computadores, servidores e suporte técnico especializado.",
  offerings: ["computadores", "suporte técnico"],
  exclusions: ["locação de veículos"],
  selectedCategories: ["ti-telecom"],
  selectedKeywords: ["servidor rack"],
  excludedKeywords: ["impressora"],
  registeredPlatforms: ["licitanet", "sicaf"],
  coverage: { scope: "states", states: ["sp", "DF"] },
  valueRange: { min: 1000, max: 500000 },
  size: "other",
});

test("normaliza um perfil válido sem alterar sua intenção", () => {
  assert.deepEqual(parseCompanyProfileInput(valid()), {
    ...valid(),
    coverage: {
      scope: "custom",
      mode: "strict",
      acceptsRemote: false,
      regions: [],
      states: ["SP", "DF"],
      municipalities: [],
      radius: null,
    },
  });
});

test("aceita cobertura combinada e valida municípios pelo código IBGE", () => {
  const parsed = parseCompanyProfileInput({
    ...valid(),
    coverage: {
      scope: "custom",
      mode: "prioritize",
      acceptsRemote: true,
      regions: ["southeast"],
      states: ["PR"],
      municipalities: [
        { ibgeCode: "3509502", name: "nome ignorado", state: "XX" },
      ],
      radius: { center: { ibgeCode: "3509502" }, km: 200 },
    },
  });
  assert.equal(parsed.coverage.scope, "custom");
  if (parsed.coverage.scope === "custom") {
    assert.deepEqual(parsed.coverage.municipalities, [
      { ibgeCode: "3509502", name: "Campinas", state: "SP" },
    ]);
    assert.equal(parsed.coverage.radius?.center.name, "Campinas");
  }
});

test("rejeita termos duplicados ignorando caixa e acentos", () => {
  const input = valid();
  input.offerings = ["Solução", "solucao"];
  assert.throws(
    () => parseCompanyProfileInput(input),
    (error) =>
      error instanceof InvalidParameterError &&
      error.details?.[0]?.field === "offerings" &&
      error.details[0].issue === "duplicate",
  );
});

test("mantém compatibilidade com clientes anteriores e valida a taxonomia", () => {
  const legacy = valid() as Record<string, unknown>;
  delete legacy.selectedCategories;
  delete legacy.selectedKeywords;
  delete legacy.excludedKeywords;
  delete legacy.registeredPlatforms;
  const parsed = parseCompanyProfileInput(legacy);
  assert.deepEqual(parsed.selectedCategories, []);
  assert.deepEqual(parsed.selectedKeywords, []);
  assert.deepEqual(parsed.excludedKeywords, []);
  assert.deepEqual(parsed.registeredPlatforms, []);
  assert.throws(
    () =>
      parseCompanyProfileInput({
        ...valid(),
        selectedCategories: ["inventada"],
      }),
    InvalidParameterError,
  );
});

test("aceita só plataformas conhecidas e SICAF em 'Sou cadastrado em'", () => {
  const invalid = (
    registeredPlatforms: unknown,
    field: string,
    issue: string,
  ) =>
    assert.throws(
      () => parseCompanyProfileInput({ ...valid(), registeredPlatforms }),
      (error) =>
        error instanceof InvalidParameterError &&
        error.details?.some(
          (detail) => detail.field === field && detail.issue === issue,
        ) === true,
    );
  invalid(["origem-ipm-sistemas"], "registeredPlatforms.0", "invalid_value");
  invalid(["bll", "bll"], "registeredPlatforms", "duplicate");
  invalid("licitanet", "registeredPlatforms", "invalid_type");
});

test("rejeita cobertura, faixa e limites inválidos", () => {
  assert.throws(
    () =>
      parseCompanyProfileInput({
        ...valid(),
        coverage: { scope: "states", states: ["XX"] },
      }),
    InvalidParameterError,
  );
  assert.throws(
    () =>
      parseCompanyProfileInput({
        ...valid(),
        valueRange: { min: 20, max: 10 },
      }),
    InvalidParameterError,
  );
  assert.throws(
    () => parseCompanyProfileInput({ ...valid(), offerings: [] }),
    InvalidParameterError,
  );
});

test("devolve todos os campos inválidos no mesmo erro", () => {
  assert.throws(
    () =>
      parseCompanyProfileInput({
        description: "curta",
        offerings: [],
        exclusions: ["x"],
        coverage: { scope: "states", states: ["XX"] },
        valueRange: { min: -1, max: "alto" },
        size: "gigante",
      }),
    (error) => {
      assert.ok(error instanceof InvalidParameterError);
      const fields = new Set(error.details?.map(({ field }) => field));
      assert.deepEqual(
        fields,
        new Set([
          "description",
          "offerings",
          "exclusions.0",
          "coverage.states",
          "valueRange.min",
          "valueRange.max",
          "size",
        ]),
      );
      return true;
    },
  );
});

test("cota ME/EPP é informativa e só exclusividade força nível baixo", () => {
  assert.equal(fitLevel(0.75), "high");
  assert.equal(fitLevel(0.74), "medium");
  assert.equal(fitLevel(0.55), "medium");
  assert.equal(fitLevel(0.54), "low");
  assert.equal(fitLevel(0.99, true), "low");
  assert.equal(fitLevel(0.99, false, "me_epp_exclusive"), "low");
  assert.equal(fitLevel(0.99, false, "me_epp_quota"), "high");
});

test("fingerprint ignora updatedAt operacional e muda com o conteúdo", () => {
  const tender = {
    title: "Aquisição de servidores",
    objectSummary: "Servidores para datacenter",
    description: "Aquisição de dois servidores.",
    organizationName: "Órgão",
    estimatedValue: "100000.00",
    state: "DF",
    items: [{ description: "Servidor rack" }],
    updatedAt: new Date("2026-09-24T00:00:00Z"),
  };
  const tenderTouched = {
    ...tender,
    updatedAt: new Date("2026-09-25T00:00:00Z"),
  };
  assert.equal(
    companyFitTenderFingerprint(tender),
    companyFitTenderFingerprint(tenderTouched),
  );
  assert.notEqual(
    companyFitTenderFingerprint(tender),
    companyFitTenderFingerprint({ ...tender, title: "Aquisição de notebooks" }),
  );
});

test("filtro lexical nasce em shadow e valida os modos explícitos", () => {
  assert.equal(fitLexicalGateMode(undefined), "shadow");
  assert.equal(fitLexicalGateMode("off"), "off");
  assert.equal(fitLexicalGateMode("on"), "on");
  assert.throws(() => fitLexicalGateMode("enabled"), /off, shadow or on/);
});
