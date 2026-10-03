import assert from "node:assert/strict";
import test from "node:test";
import { planTeacherSample, selectFocusedCandidates, type SampleCandidate } from "./sample-plan";

const candidate = (id: string, title: string, orderKey = id): SampleCandidate => ({
  id,
  title,
  modality: "Pregão eletrônico",
  state: "SP",
  orderKey,
});

test("amostra estratificada deduplica o texto normalizado", () => {
  const plan = planTeacherSample([
    candidate("a", "Aquisição de medicamentos", "02"),
    candidate("b", "  aquisição DE medicamentos ", "01"),
    candidate("c", "Locação de veículos", "03"),
  ], 10);
  assert.deepEqual(plan.map(({ id }) => id), ["b", "c"]);
});

test("amostra focada alterna classes e prioriza as menores confianças", () => {
  const plan = selectFocusedCandidates([
    { candidate: candidate("o2", "Outro dois", "02"), primary: "outros", confidence: 0.41 },
    { candidate: candidate("e1", "Evento um", "03"), primary: "eventos-cultura", confidence: 0.22 },
    { candidate: candidate("o1", "Outro um", "01"), primary: "outros", confidence: 0.21 },
    { candidate: candidate("e2", "Evento dois", "04"), primary: "eventos-cultura", confidence: 0.42 },
    { candidate: candidate("x", "Ignorado", "00"), primary: "ti-telecom", confidence: 0.01 },
  ], ["outros", "eventos-cultura", "outros"], 4);
  assert.deepEqual(plan.map(({ id }) => id), ["o1", "e1", "o2", "e2"]);
});

test("amostra focada preenche o alvo quando uma classe tem poucos candidatos", () => {
  const plan = selectFocusedCandidates([
    { candidate: candidate("o1", "Outro um"), primary: "outros", confidence: 0.2 },
    { candidate: candidate("s1", "Saúde um"), primary: "servicos-saude", confidence: 0.1 },
    { candidate: candidate("s2", "Saúde dois"), primary: "servicos-saude", confidence: 0.3 },
  ], ["outros", "servicos-saude"], 3);
  assert.deepEqual(plan.map(({ id }) => id), ["o1", "s1", "s2"]);
});
