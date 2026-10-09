import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
const {
  normalizeSignalTerms,
  scoreOpportunityForProfile,
  scoreRecommendation,
  temporalWeight,
} = await import("./recommendation-service");

test("normaliza termos de busca e remove palavras genéricas", () => {
  assert.deepEqual(
    normalizeSignalTerms(
      "Contratação de HEMODIÁLISE e medicamentos, medicamentos",
    ),
    ["hemodialise", "medicamentos"],
  );
});

test("eventos perdem metade do peso a cada 30 dias", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  assert.equal(temporalWeight(now, now), 1);
  assert.ok(
    Math.abs(temporalWeight(new Date("2026-09-08T12:00:00Z"), now) - 0.5) <
      0.001,
  );
});

const profile = {
  terms: [{ value: "hemodialise", weight: 10 }],
  categories: [{ value: "saude", label: "Saúde", weight: 8 }],
  states: [{ value: "sp", weight: 5 }],
  organizations: [{ value: "org-1", label: "Hospital", weight: 4 }],
  modalities: [],
  valueMin: 10_000,
  valueMax: 1_000_000,
  coverageScope: "states" as const,
  coverageStates: ["SP", "MG"],
  exclusions: ["odontologia"],
  companySize: "me_epp" as const,
  signalCount: 3,
};

test("pontuação explica termos, categoria e cobertura e penaliza fora da área", () => {
  const base = {
    id: "T1",
    searchText: "servicos de hemodialise",
    categories: [{ slug: "saude", label: "Saúde" }],
    organizationId: "org-1",
    organizationName: "Hospital",
    modality: "other",
    platform: null,
    platformLabel: null,
    estimatedValue: "100000",
    proposalDeadline: new Date("2026-10-20T12:00:00Z"),
    publishedAt: new Date("2026-10-07T12:00:00Z"),
    textRank: 0.5,
  };
  const inside = scoreRecommendation(
    { ...base, state: "SP" },
    profile,
    [],
    new Date("2026-10-08T12:00:00Z"),
  );
  const outside = scoreRecommendation(
    { ...base, state: "RJ" },
    profile,
    [],
    new Date("2026-10-08T12:00:00Z"),
  );
  assert.ok(inside && outside);
  assert.ok(inside.score > outside.score + 40);
  assert.match(
    inside.reasons.map(({ text }) => text).join(" "),
    /Saúde|hemodialise/,
  );
});

test("plataforma cadastrada desempata, mas não recomenda sozinha", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const candidate = {
    id: "T3",
    searchText: "servicos de hemodialise",
    categories: [],
    state: "SP",
    organizationId: "O3",
    organizationName: "Órgão",
    modality: "other",
    platform: "licitanet",
    platformLabel: "Licitanet",
    estimatedValue: null,
    proposalDeadline: new Date("2026-10-20T12:00:00Z"),
    publishedAt: new Date("2026-10-07T12:00:00Z"),
    textRank: 0.5,
  };
  const registered = { ...profile, registeredPlatforms: ["licitanet", "sicaf"] };
  const boosted = scoreRecommendation(candidate, registered, [], now);
  const plain = scoreRecommendation(candidate, profile, [], now);
  assert.ok(boosted && plain);
  assert.equal(Number((boosted.score - plain.score).toFixed(5)), 6);
  assert.ok(boosted.reasons.some(({ kind }) => kind === "platform"));

  const unrelated = scoreRecommendation(
    { ...candidate, searchText: "material de escritorio", state: null, textRank: 0 },
    { ...registered, coverageScope: null, coverageStates: [] },
    [],
    now,
  );
  assert.equal(unrelated, null);
});

test("exclusões eliminam o candidato", () => {
  const result = scoreRecommendation(
    {
      id: "T2",
      searchText: "servicos de odontologia",
      categories: [],
      state: "SP",
      organizationId: "O2",
      organizationName: "Órgão",
      modality: "other",
      platform: null,
      platformLabel: null,
      estimatedValue: null,
      proposalDeadline: new Date("2026-10-20"),
      publishedAt: new Date("2026-10-07"),
      textRank: 1,
    },
    profile,
    [],
    new Date("2026-10-08"),
  );
  assert.equal(result, null);
});

test("oportunidades reutilizam termos, cobertura e faixa do perfil", () => {
  const match = scoreOpportunityForProfile(
    {
      searchText: "programa de inovacao para empresas de inteligencia artificial",
      audience: "startups e ICTs",
      state: "SP",
      amount: 250_000,
    },
    {
      description: "Desenvolvemos inteligência artificial para indústrias",
      offerings: ["software de inteligência artificial"],
      exclusions: [],
      selectedKeywords: ["inovação", "startups"],
      excludedKeywords: [],
      coverageScope: "states",
      coverageStates: ["SP"],
      valueMin: "100000",
      valueMax: "500000",
    },
  );
  assert.ok(match);
  assert.ok(match.score >= 55);
  assert.match(match.reasons.join(" "), /perfil|SP|Valor/);
});
