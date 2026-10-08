import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
const {
  addTermCooccurrences,
  extractProfileTerms,
  normalizeProfileKeyword,
  rankDescriptionVocabulary,
  topRelatedTerms,
} = await import("./keyword-vocabulary");

test("normaliza português, remove acentos e extrai uni/bi/trigramas sem stopword isolada", () => {
  assert.equal(
    normalizeProfileKeyword("  ILUMINAÇÃO cênica! "),
    "iluminacao cenica",
  );
  const terms = extractProfileTerms(
    "Contratação de iluminação cênica, painel de LED e caixa de som.",
  );
  const normalized = terms.map(({ normalizedTerm }) => normalizedTerm);
  assert.ok(normalized.includes("iluminacao"));
  assert.ok(normalized.includes("iluminacao cenica"));
  assert.ok(normalized.includes("painel de led"));
  assert.ok(normalized.includes("caixa de som"));
  assert.equal(normalized.includes("de"), false);
});

test("sugestão da descrição prioriza expressões específicas presentes no vocabulário", () => {
  const rows = [
    { normalizedTerm: "iluminacao", ngramSize: 1, openTenderCount: 80 },
    { normalizedTerm: "iluminacao cenica", ngramSize: 2, openTenderCount: 12 },
    {
      normalizedTerm: "material hospitalar",
      ngramSize: 2,
      openTenderCount: 500,
    },
  ];
  assert.deepEqual(
    rankDescriptionVocabulary(
      "Prestamos iluminação cênica para eventos.",
      rows,
    ).map(({ normalizedTerm }) => normalizedTerm),
    ["iluminacao cenica", "iluminacao"],
  );
});

test("relacionados são ranqueados pela coocorrência nos mesmos editais", () => {
  const cooccurrence = new Map<string, Map<string, number>>();
  addTermCooccurrences(cooccurrence, ["som", "sonorizacao", "caixa de som"]);
  addTermCooccurrences(cooccurrence, ["som", "sonorizacao", "mesa de som"]);
  addTermCooccurrences(cooccurrence, ["som", "sonorizacao"]);
  assert.deepEqual(topRelatedTerms(cooccurrence, "som", 1, 3), [
    "caixa de som",
    "mesa de som",
    "sonorizacao",
  ]);
});
