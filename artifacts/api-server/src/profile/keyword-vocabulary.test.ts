import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
const {
  addTermCooccurrences,
  extractProfileTerms,
  isSuggestableProfileTerm,
  MAX_OPEN_TENDER_SHARE,
  normalizeProfileKeyword,
  profilePhraseQuery,
  rankDescriptionVocabulary,
  topRelatedTerms,
  withinOpenTenderShare,
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

test("termos genéricos de licitação não viram sugestão, sozinhos ou nas pontas de uma expressão", () => {
  const normalized = extractProfileTerms(
    "Contratação de empresa especializada para prestação de serviços de limpeza predial, " +
      "registro de preços para eventual e futura aquisição, conforme termo de referência e seus anexos, " +
      "fornecimento de água mineral, transmissão ao vivo do evento em 2026, município de Santos.",
  ).map(({ normalizedTerm }) => normalizedTerm);
  for (const generic of [
    "empresa",
    "especializada",
    "empresa especializada",
    "contratacao de empresa",
    "especializada para prestacao",
    "prestacao de servicos",
    "registro de precos",
    "eventual",
    "futura",
    "eventual e futura",
    "conforme",
    "termo de referencia",
    "seus anexos",
    "municipio",
    "2026",
  ])
    assert.equal(normalized.includes(generic), false, generic);
  for (const specific of [
    "limpeza",
    "limpeza predial",
    "servicos de limpeza",
    "fornecimento de agua",
    "agua mineral",
    "transmissao ao vivo",
    "santos",
  ])
    assert.ok(normalized.includes(specific), specific);
});

test("leituras reaplicam as regras, então um termo genérico gravado antes não é sugerido", () => {
  assert.equal(isSuggestableProfileTerm("empresa"), false);
  assert.equal(isSuggestableProfileTerm("empresa especializada"), false);
  assert.equal(isSuggestableProfileTerm("contratacao de empresa"), false);
  assert.equal(isSuggestableProfileTerm("iluminacao cenica"), true);
  assert.equal(isSuggestableProfileTerm("caixa de som"), true);
});

test("teto de frequência: termo em mais de 20% dos editais abertos fica fora do vocabulário", () => {
  assert.equal(MAX_OPEN_TENDER_SHARE, 0.2);
  assert.equal(withinOpenTenderShare(425, 1_000), false);
  assert.equal(withinOpenTenderShare(201, 1_000), false);
  assert.equal(withinOpenTenderShare(200, 1_000), true);
  assert.equal(withinOpenTenderShare(148, 1_000), true);
  // Base pequena (testes, banco recém-criado): a proporção não diz nada e o teto não se aplica.
  assert.equal(withinOpenTenderShare(10, 12), true);
});

test("contagem usa cada termo como expressão entre aspas, sem acento e sem repetição", () => {
  assert.equal(
    profilePhraseQuery(["Transmissão ao vivo", "iluminação", "iluminacao", ' a"spas ']),
    '"transmissao ao vivo" OR "iluminacao" OR "a spas"',
  );
  assert.equal(profilePhraseQuery([]), "");
});
