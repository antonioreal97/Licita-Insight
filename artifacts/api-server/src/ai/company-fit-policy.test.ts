import assert from "node:assert/strict";
import { test } from "node:test";
import { InvalidParameterError } from "../lib/api-error";
import { fitLevel, parseCompanyProfileInput } from "./company-fit-policy";

const valid = () => ({
  description:
    "Fornecemos computadores, servidores e suporte técnico especializado.",
  offerings: ["computadores", "suporte técnico"],
  exclusions: ["locação de veículos"],
  coverage: { scope: "states", states: ["sp", "DF"] },
  valueRange: { min: 1000, max: 500000 },
  size: "other",
});

test("normaliza um perfil válido sem alterar sua intenção", () => {
  assert.deepEqual(parseCompanyProfileInput(valid()), {
    ...valid(),
    coverage: { scope: "states", states: ["SP", "DF"] },
  });
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

test("converte score em nível e força baixo por exclusão ou porte", () => {
  assert.equal(fitLevel(0.75), "high");
  assert.equal(fitLevel(0.5), "medium");
  assert.equal(fitLevel(0.49), "low");
  assert.equal(fitLevel(0.99, true), "low");
  assert.equal(fitLevel(0.99, false, true), "low");
});
