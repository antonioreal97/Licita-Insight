import assert from "node:assert/strict";
import { test } from "node:test";
import {
  qualificationSearchQuery,
  segmentQualificationPage,
  stitchIndexedPage,
} from "./qualification-checklist-policy";

test("segments real extracted-page shapes on numbered and lettered edital items", () => {
  const page = [
    "7. HABILITAÇÃO",
    "7.3 Regularidade fiscal: prova de inscrição no CNPJ.",
    "7.4.1. Qualificação técnica: atestado de capacidade técnica.",
    "a) registro da empresa no CREA;",
    "b) registro do responsável técnico no CAU.",
  ].join("\n");

  assert.deepEqual(segmentQualificationPage(page), [
    "7. HABILITAÇÃO",
    "7.3 Regularidade fiscal: prova de inscrição no CNPJ.",
    "7.4.1. Qualificação técnica: atestado de capacidade técnica.",
    "a) registro da empresa no CREA;",
    "b) registro do responsável técnico no CAU.",
  ]);
});

test("reassembles the overlapping stored passage shape before segmentation", () => {
  const first =
    "6. DAS PROPOSTAS regras gerais 7.3 Regularidade fiscal mediante certidão negativa e prova de inscrição";
  const second =
    "7.3 Regularidade fiscal mediante certidão negativa e prova de inscrição 7.4 Qualificação técnica mediante atestado de capacidade";
  const stitched = stitchIndexedPage([
    { order: 1, text: second },
    { order: 0, text: first },
  ]);

  assert.equal(
    stitched,
    "6. DAS PROPOSTAS regras gerais 7.3 Regularidade fiscal mediante certidão negativa e prova de inscrição 7.4 Qualificação técnica mediante atestado de capacidade",
  );
  assert.deepEqual(segmentQualificationPage(stitched), [
    "6. DAS PROPOSTAS regras gerais",
    "7.3 Regularidade fiscal mediante certidão negativa e prova de inscrição",
    "7.4 Qualificação técnica mediante atestado de capacidade",
  ]);
});

test("uses the fixed Portuguese qualification vocabulary for the tsvector shortlist", () => {
  const query = qualificationSearchQuery();
  assert.match(query, /habilitação/);
  assert.match(query, /"regularidade trabalhista"/);
  assert.match(query, /"ato constitutivo"/);
  assert.match(query, /CREA/);
});
