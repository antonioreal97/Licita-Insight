import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
const {
  extractInterestExpressions,
  matchesRecommendationTerm,
  normalizeSignalTerms,
  scoreOpportunityForProfile,
  scoreRecommendation,
  scoreDeclaredOpportunity,
  temporalWeight,
} = await import("./recommendation-service");

test("finalidades recomendam fontes correspondentes e proponente só reordena", () => {
  const call = {
    kind: "culture" as const,
    source: "mapas" as const,
    areas: ["audiovisual"],
    audience: null,
    opportunityType: null,
    title: "Edital de cinema",
    summary: null,
  };
  assert.equal(scoreDeclaredOpportunity(call, [], ["individual"]), null);
  const unknown = scoreDeclaredOpportunity(call, ["culture"], ["individual"]);
  const matched = scoreDeclaredOpportunity(
    { ...call, audience: "Pessoa física" },
    ["culture"],
    ["individual"],
  );
  assert.ok(unknown && matched);
  assert.ok(matched.score > unknown.score);
  assert.equal(scoreDeclaredOpportunity(call, ["study"], []), null);
  assert.ok(
    scoreDeclaredOpportunity(
      { ...call, kind: "funding", source: "cnpq" },
      ["research"],
      [],
    ),
  );
});

test("normaliza termos de busca e remove palavras genéricas", () => {
  assert.deepEqual(
    normalizeSignalTerms(
      "Contratação de HEMODIÁLISE e medicamentos, medicamentos",
    ),
    ["hemodialise", "medicamentos"],
  );
});

test("casa palavras inteiras nas flexões plurais comuns do português", () => {
  const pairs = [
    ["trator", "tratores"],
    ["computador", "computadores"],
    ["motor", "motores"],
    ["luz", "luzes"],
    ["gas", "gases"],
    ["material", "materiais"],
    ["locacao", "locacoes"],
    ["impressao", "impressoes"],
    ["pao", "paes"],
    ["mao", "maos"],
    ["item", "itens"],
    ["papel", "papeis"],
    ["lei", "leis"],
    ["farol", "farois"],
    ["azul", "azuis"],
    ["notebook", "notebooks"],
    ["drone", "drones"],
    ["pneu", "pneus"],
  ] as const;
  for (const [singular, plural] of pairs) {
    assert.equal(
      matchesRecommendationTerm(`aquisição de ${plural}`, singular),
      true,
      `${singular} deve casar com ${plural}`,
    );
    assert.equal(
      matchesRecommendationTerm(`aquisição de ${singular}`, plural),
      true,
      `${plural} deve casar com ${singular}`,
    );
  }
});

test("não casa pedaços de outras palavras", () => {
  assert.equal(matchesRecommendationTerm("Cartões de parte", "arte"), false);
  assert.equal(matchesRecommendationTerm("Manobra", "obra"), false);
  assert.equal(matchesRecommendationTerm("Messias", "mes"), false);
});

test("casa expressões flexionadas somente quando contíguas", () => {
  assert.equal(
    matchesRecommendationTerm(
      "serviço de locações de veículos",
      "locação de veículos",
    ),
    true,
  );
  assert.equal(
    matchesRecommendationTerm(
      "serviço de locação de veículo",
      "locações de veículos",
    ),
    true,
  );
  assert.equal(
    matchesRecommendationTerm(
      "serviço de transmissão ao vivo do evento",
      "transmissao ao vivo",
    ),
    true,
  );
  assert.equal(
    matchesRecommendationTerm(
      "transmissão de dados com apresentação ao vivo",
      "transmissao ao vivo",
    ),
    false,
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
  terms: [{ value: "hemodialise", weight: 10, label: "profile:hemodialise" }],
  categories: [{ value: "saude", label: "profile_category:saude", weight: 8 }],
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

const baseCandidate = {
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

test("pontuação explica termos, categoria e cobertura e penaliza fora da área", () => {
  const inside = scoreRecommendation(
    { ...baseCandidate, state: "SP" },
    profile,
    [],
    new Date("2026-10-08T12:00:00Z"),
  );
  const outside = scoreRecommendation(
    { ...baseCandidate, state: "RJ" },
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

test("valor suspeito não conta a favor nem contra a faixa de valor", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const candidate = {
    id: "T-value",
    searchText: "servicos de hemodialise",
    categories: [] as { slug: string; label: string }[],
    state: "SP",
    organizationId: "O-value",
    organizationName: "Órgão",
    modality: "dispensa",
    platform: null,
    platformLabel: null,
    proposalDeadline: new Date("2026-10-20T12:00:00Z"),
    publishedAt: new Date("2026-10-07T12:00:00Z"),
    textRank: 0.5,
  };
  const unknown = scoreRecommendation(
    { ...candidate, estimatedValue: null },
    profile,
    [],
    now,
  );
  const inside = scoreRecommendation(
    { ...candidate, estimatedValue: "100000" },
    profile,
    [],
    now,
  );
  const outside = scoreRecommendation(
    { ...candidate, estimatedValue: "938761000000.00" },
    profile,
    [],
    now,
  );
  const flagged = scoreRecommendation(
    {
      ...candidate,
      estimatedValue: "938761000000.00",
      estimatedValueFlag: "absolute_ceiling",
    },
    profile,
    [],
    now,
  );
  assert.ok(unknown && inside && outside && flagged);
  assert.ok(inside.score > unknown.score && unknown.score > outside.score);
  assert.equal(flagged.score, unknown.score);
  assert.ok(!flagged.reasons.some(({ kind }) => kind === "value"));
});

test("plataforma cadastrada desempata, mas não recomenda sozinha", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const candidate = {
    id: "T3",
    searchText: "servicos de hemodialise",
    categories: [] as { slug: string; label: string }[],
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
  const registered = {
    ...profile,
    registeredPlatforms: ["licitanet", "sicaf"],
  };
  const boosted = scoreRecommendation(candidate, registered, [], now);
  const plain = scoreRecommendation(candidate, profile, [], now);
  assert.ok(boosted && plain);
  assert.equal(Number((boosted.score - plain.score).toFixed(5)), 6);
  assert.ok(boosted.reasons.some(({ kind }) => kind === "platform"));

  const unrelated = scoreRecommendation(
    {
      ...candidate,
      searchText: "material de escritorio",
      state: null,
      textRank: 0,
    },
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

test("descrição do perfil reforça, mas não qualifica sozinha", () => {
  const descriptionOnly = {
    ...profile,
    terms: [
      {
        value: "manutencao",
        weight: 2,
        label: "profile_description:manutencao",
      },
    ],
    categories: [],
  };
  assert.equal(
    scoreRecommendation(
      {
        ...baseCandidate,
        searchText: "manutencao predial preventiva",
        categories: [],
        state: "SP",
      },
      descriptionOnly,
      [],
      new Date("2026-10-08T12:00:00Z"),
    ),
    null,
  );
  const reinforced = scoreRecommendation(
    {
      ...baseCandidate,
      searchText: "drone para manutencao de estruturas",
      categories: [],
      state: "SP",
    },
    {
      ...descriptionOnly,
      terms: [
        {
          value: "drone",
          weight: 12,
          label: "saved:drone",
          sources: ["profile", "saved"],
        },
        ...descriptionOnly.terms,
      ],
    },
    [],
    new Date("2026-10-08T12:00:00Z"),
  );
  assert.ok(reinforced);
  assert.match(reinforced.reasons.map(({ text }) => text).join(" "), /drone/);
});

test("dispensas ignoram categoria genérica, decaem e têm teto total", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const candidate = {
    ...baseCandidate,
    state: "SP",
    categories: [{ slug: "outros", label: "Outros" }],
  };
  const baseline = scoreRecommendation(candidate, profile, [], now);
  const generic = scoreRecommendation(
    candidate,
    profile,
    Array.from({ length: 20 }, () => ({
      terms: [],
      categories: [{ slug: "outros", label: "Outros" }],
      dismissedAt: now,
    })),
    now,
  );
  assert.ok(baseline && generic);
  assert.equal(generic.score, baseline.score);
  const recent = scoreRecommendation(
    candidate,
    profile,
    Array.from({ length: 20 }, () => ({
      terms: ["hemodialise"],
      categories: [],
      dismissedAt: now,
    })),
    now,
  );
  const old = scoreRecommendation(
    candidate,
    profile,
    [
      {
        terms: ["hemodialise"],
        categories: [],
        dismissedAt: new Date("2026-07-10T12:00:00Z"),
      },
    ],
    now,
  );
  assert.ok(recent && old);
  assert.equal(Number((baseline.score - recent.score).toFixed(5)), 12);
  assert.ok(old.score > recent.score);
  assert.ok(old.score < baseline.score);
});

test("região rígida filtra e prioridade mantém edital de fora com motivo", () => {
  const candidate = {
    id: "T-region",
    searchText: "servicos de hemodialise",
    categories: [{ slug: "saude", label: "Saúde" }],
    state: "RJ",
    municipalityIbge: "3304557",
    organizationId: "O-region",
    organizationName: "Órgão",
    modality: "other",
    platform: null,
    platformLabel: null,
    estimatedValue: "100000",
    proposalDeadline: new Date("2026-10-20"),
    publishedAt: new Date("2026-10-07"),
    textRank: 1,
  };
  const serviceRegion = {
    ...profile,
    coverageScope: "custom" as const,
    coverageStates: ["SP"],
    coverageRegions: [],
    coverageMunicipalities: [],
    headquartersMunicipalityIbge: null,
    coverageRadiusKm: null,
  };
  assert.equal(
    scoreRecommendation(
      candidate,
      { ...serviceRegion, coverageMode: "strict" },
      [],
      new Date("2026-10-08"),
    ),
    null,
  );
  const prioritized = scoreRecommendation(
    candidate,
    { ...serviceRegion, coverageMode: "prioritize" },
    [],
    new Date("2026-10-08"),
  );
  assert.ok(prioritized);
  assert.ok(
    prioritized.reasons.some(({ text }) => text === "Fora da sua região"),
  );
});

test("histórico sozinho ou termos genéricos não criam recomendação", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  assert.deepEqual(
    normalizeSignalTerms(
      "uso solucao destinados centro equipamentos materiais aquisicao",
    ),
    [],
  );
  const historyOnly = {
    ...profile,
    terms: [
      { value: "cameras", weight: 10, label: "monitored:cameras" },
      { value: "solucao", weight: 8, label: "saved:solucao" },
    ],
    categories: [
      { value: "ti-telecom", label: "Tecnologia da informação", weight: 9 },
    ],
  };
  assert.equal(
    scoreRecommendation(
      {
        ...baseCandidate,
        searchText: "solucao tecnologica para gestao com cameras de uso",
        categories: [{ slug: "ti-telecom", label: "Tecnologia da informação" }],
        state: "SP",
      },
      historyOnly,
      [],
      now,
    ),
    null,
  );
});

test("caso do dono: DF+audiovisual strict não recomenda odontologia/medicamentos/pasta fora da região", () => {
  const now = new Date("2026-10-16T20:00:00Z");
  const owner = {
    terms: [
      { value: "audiovisual", weight: 12, label: "profile:audiovisual" },
      { value: "cameras", weight: 10, label: "monitored:cameras" },
      { value: "uso", weight: 8, label: "saved:uso" },
      { value: "solucao", weight: 6, label: "saved:solucao" },
    ],
    categories: [
      { value: "ti-telecom", label: "Tecnologia da informação", weight: 5 },
      {
        value: "eventos-cultura",
        label: "Eventos, shows e cultura",
        weight: 4,
      },
    ],
    states: [{ value: "df", weight: 5 }],
    organizations: [],
    modalities: [],
    valueMin: null,
    valueMax: null,
    coverageScope: "custom" as const,
    coverageMode: "strict" as const,
    coverageStates: ["DF"],
    coverageRegions: [],
    coverageMunicipalities: ["5300108"],
    headquartersMunicipalityIbge: "5300108",
    coverageRadiusKm: 100 as const,
    acceptsRemote: true,
    exclusions: [],
    companySize: "me_epp" as const,
    signalCount: 4,
  };
  const unrelated = [
    {
      id: "odontologia-ap",
      searchText: "materiais de consumo odontologicos",
      categories: [
        { slug: "medicamentos-insumos-saude", label: "Medicamentos" },
      ],
      state: "AP",
    },
    {
      id: "milrinona-pe",
      searchText: "medicamentos milrinona",
      categories: [
        { slug: "medicamentos-insumos-saude", label: "Medicamentos" },
      ],
      state: "PE",
    },
    {
      id: "diploma-go",
      searchText: "pasta para diploma",
      categories: [
        { slug: "material-escritorio", label: "Material de escritório" },
      ],
      state: "GO",
    },
    {
      id: "ti-sp",
      searchText: "solucao tecnologica para gestao estrategica",
      categories: [{ slug: "ti-telecom", label: "Tecnologia da informação" }],
      state: "SP",
    },
  ];
  for (const item of unrelated) {
    assert.equal(
      scoreRecommendation(
        {
          ...baseCandidate,
          ...item,
          organizationId: "org-x",
          organizationName: "Órgão",
          estimatedValue: null,
          textRank: 0.2,
        },
        owner,
        [],
        now,
      ),
      null,
      item.id,
    );
  }
  const remoteAudiovisual = scoreRecommendation(
    {
      ...baseCandidate,
      id: "av-remote",
      searchText: "servicos de producao audiovisual e filmagem",
      categories: [{ slug: "ti-telecom", label: "Tecnologia da informação" }],
      state: "SP",
      municipalityIbge: "3550308",
      organizationId: "org-av",
      organizationName: "Órgão",
      estimatedValue: null,
      textRank: 0.8,
    },
    owner,
    [],
    now,
  );
  assert.ok(remoteAudiovisual);
  assert.ok(
    remoteAudiovisual.reasons.some(({ text }) =>
      /audiovisual|distância|distancia/i.test(text),
    ),
  );
  assert.ok(
    !remoteAudiovisual.reasons.some(
      ({ text }) =>
        /cameras|uso|solucao/i.test(text) && !/audiovisual/i.test(text),
    ),
  );
});

test("remoto sem casamento direto com o perfil é rejeitado em strict", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const result = scoreRecommendation(
    {
      ...baseCandidate,
      searchText: "consultoria em tecnologia da informacao",
      categories: [{ slug: "ti-telecom", label: "Tecnologia da informação" }],
      state: "RJ",
      municipalityIbge: "3304557",
    },
    {
      ...profile,
      terms: [
        { value: "hemodialise", weight: 10, label: "profile:hemodialise" },
      ],
      categories: [],
      coverageScope: "custom",
      coverageMode: "strict",
      coverageStates: ["SP"],
      coverageRegions: [],
      coverageMunicipalities: [],
      headquartersMunicipalityIbge: null,
      coverageRadiusKm: null,
      acceptsRemote: true,
    },
    [],
    now,
  );
  assert.equal(result, null);
});

test("oportunidades reutilizam termos, cobertura e faixa do perfil", () => {
  const match = scoreOpportunityForProfile(
    {
      searchText:
        "programa de inovacao para empresas de inteligencia artificial",
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

test("Interessa extrai expressões úteis e ignora genéricos do vocabulário #142", () => {
  const expressions = extractInterestExpressions({
    title: "Contratação de empresa para locação de equipamentos audiovisuais",
    objectSummary: "Locação de equipamentos audiovisuais para eventos",
    items: [{ description: "Projetor e sistema de som" }],
    categories: [
      { slug: "eventos-cultura", label: "Eventos, shows e cultura" },
    ],
    organizationName: "Secretaria de Cultura do DF",
  });
  assert.ok(expressions.includes("locacao"));
  assert.ok(expressions.some((term) => term.includes("audiovisua")));
  assert.ok(!expressions.includes("empresa"));
  assert.ok(!expressions.includes("contratacao"));
  assert.ok(!expressions.includes("equipamentos"));
  assert.ok(!expressions.some((term) => term.includes("secretaria")));
  assert.ok(!expressions.some((term) => term.includes("shows")));
});

test("Interessa extrai por campo e preserva o termo concreto comum", () => {
  const first = extractInterestExpressions({
    title: "Aquisição de drone para inspeção aérea",
    objectSummary: "Drone com câmera térmica",
    organizationName: "Gabinete Militar do Governador",
  });
  const second = extractInterestExpressions({
    title: "Serviço com drones para mapeamento",
    objectSummary: "Operação de drone em levantamento topográfico",
    organizationName: "Secretaria Municipal de Obras",
  });
  assert.ok(first.includes("drone"));
  assert.ok(second.includes("drone"));
  assert.ok(first.filter((term) => second.includes(term)).includes("drone"));
  assert.ok(!first.some((term) => term.includes("gabinete")));
  assert.ok(!second.some((term) => term.includes("secretaria")));
});

test("Interessa compartilha formas canônicas entre singular e plural", () => {
  const singular = extractInterestExpressions({
    title: "Locação veículos gás para apoio operacional",
  });
  const plural = extractInterestExpressions({
    title: "Locações veículos gases para apoios operacionais",
  });
  const common = singular.filter((term) => plural.includes(term));
  assert.ok(common.includes("locacao"));
  assert.ok(common.includes("veiculo"));
  assert.ok(common.includes("gas"));
  assert.ok(common.includes("locacao veiculo"));
});

test("após 2 Interessa parecidos, expressões aprendidas qualificam em DF e não fora (strict)", () => {
  const now = new Date("2026-10-16T20:00:00Z");
  const learned = {
    terms: [
      {
        value: "locacao de equipamentos audiovisuais",
        weight: 20,
        label: "interest_learned:locacao de equipamentos audiovisuais",
      },
      {
        value: "audiovisuais",
        weight: 18,
        label: "interest_learned:audiovisuais",
      },
    ],
    categories: [],
    states: [{ value: "df", weight: 5 }],
    organizations: [],
    modalities: [],
    valueMin: null,
    valueMax: null,
    coverageScope: "custom" as const,
    coverageMode: "strict" as const,
    coverageStates: ["DF"],
    coverageRegions: [],
    coverageMunicipalities: ["5300108"],
    headquartersMunicipalityIbge: "5300108",
    coverageRadiusKm: 100 as const,
    acceptsRemote: true,
    exclusions: [],
    companySize: "me_epp" as const,
    signalCount: 4,
  };
  const base = {
    categories: [
      { slug: "eventos-cultura", label: "Eventos, shows e cultura" },
    ],
    organizationId: "org-df",
    organizationName: "Secretaria",
    modality: "other",
    platform: null,
    platformLabel: null,
    estimatedValue: null,
    proposalDeadline: new Date("2026-11-20T12:00:00Z"),
    publishedAt: new Date("2026-10-15T12:00:00Z"),
    textRank: 0.6,
  };
  const inside = scoreRecommendation(
    {
      ...base,
      id: "df-av",
      searchText: "locacao de equipamentos audiovisuais para festival",
      state: "DF",
      municipalityIbge: "5300108",
    },
    learned,
    [],
    now,
  );
  const outside = scoreRecommendation(
    {
      ...base,
      id: "sp-av",
      searchText: "locacao de equipamentos audiovisuais para festival",
      state: "SP",
      municipalityIbge: "3550308",
    },
    learned,
    [],
    now,
  );
  assert.ok(inside);
  assert.match(
    inside.reasons.map(({ text }) => text).join(" "),
    /marcou como interesse/,
  );
  assert.equal(outside, null);
});

test("um único Interessa só reforça; sozinho não qualifica sem perfil", () => {
  const now = new Date("2026-10-16T20:00:00Z");
  const once = {
    terms: [
      {
        value: "audiovisuais",
        weight: 14,
        label: "interest:audiovisuais",
      },
    ],
    categories: [],
    states: [],
    organizations: [],
    modalities: [],
    valueMin: null,
    valueMax: null,
    coverageScope: "national" as const,
    coverageStates: [],
    exclusions: [],
    companySize: null,
    signalCount: 1,
  };
  assert.equal(
    scoreRecommendation(
      {
        id: "once",
        searchText: "servicos audiovisuais",
        categories: [],
        state: "DF",
        organizationId: "o",
        organizationName: "Órgão",
        modality: "other",
        platform: null,
        platformLabel: null,
        estimatedValue: null,
        proposalDeadline: new Date("2026-11-20"),
        publishedAt: new Date("2026-10-15"),
        textRank: 0.5,
      },
      once,
      [],
      now,
    ),
    null,
  );
});

test("meia-vida de Interessa é 60 dias", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  assert.ok(
    Math.abs(temporalWeight(new Date("2026-08-09T12:00:00Z"), now, 60) - 0.5) <
      0.001,
  );
});

test("termos do perfil casam como expressão inteira; boilerplate de licitação não vira sinal", () => {
  assert.deepEqual(
    normalizeSignalTerms(
      "Contratação de empresa especializada para prestação de serviços de iluminação",
    ),
    ["iluminacao"],
  );
  const profile = {
    description: "Produtora audiovisual",
    offerings: ["transmissão ao vivo"],
    exclusions: [],
    selectedKeywords: [],
    excludedKeywords: [],
    coverageScope: "national",
    coverageStates: [],
    valueMin: null,
    valueMax: null,
  };
  const loose = scoreOpportunityForProfile(
    {
      searchText: "show ao vivo na praca e transmissao de dados",
      audience: null,
      state: null,
      amount: null,
    },
    profile,
  );
  assert.equal(
    loose?.reasons.some((reason) => reason.startsWith("Combina com")) ?? false,
    false,
  );
  const phrase = scoreOpportunityForProfile(
    {
      searchText: "edital de transmissao ao vivo de festivais",
      audience: null,
      state: null,
      amount: null,
    },
    profile,
  );
  assert.ok(
    phrase?.reasons.includes("Combina com seu perfil: transmissao ao vivo"),
  );
});

const opportunityProfile = {
  description: "Inspeção técnica de estruturas",
  offerings: ["drone"],
  exclusions: [] as string[],
  selectedKeywords: [] as string[],
  excludedKeywords: [] as string[],
  coverageScope: "custom" as const,
  coverageStates: ["MG"],
  coverageRegions: [] as Array<
    "north" | "northeast" | "central_west" | "southeast" | "south"
  >,
  coverageMunicipalities: [] as string[],
  headquartersMunicipalityIbge: null as string | null,
  coverageRadiusKm: null as number | null,
  coverageMode: "strict" as const,
  acceptsRemote: false,
  valueMin: null,
  valueMax: null,
};

const opportunity = {
  searchText: "programa para aquisição de drones",
  audience: null,
  amount: null,
  state: "MG",
};

test("oportunidades respeitam UF, município, raio, macrorregião, remoto e prioridade", () => {
  assert.ok(scoreOpportunityForProfile(opportunity, opportunityProfile));
  assert.equal(
    scoreOpportunityForProfile(
      { ...opportunity, state: "SP" },
      opportunityProfile,
    ),
    null,
  );
  assert.ok(
    scoreOpportunityForProfile(
      { ...opportunity, state: null },
      opportunityProfile,
    ),
  );
  assert.ok(
    scoreOpportunityForProfile(
      { ...opportunity, municipalityIbge: "3106200" },
      {
        ...opportunityProfile,
        coverageStates: [],
        coverageMunicipalities: ["3106200"],
      },
    ),
  );
  assert.equal(
    scoreOpportunityForProfile(
      { ...opportunity, municipalityIbge: "3170206" },
      {
        ...opportunityProfile,
        coverageStates: [],
        coverageMunicipalities: ["3106200"],
      },
    ),
    null,
  );
  assert.ok(
    scoreOpportunityForProfile(
      { ...opportunity, municipalityIbge: "3106200" },
      {
        ...opportunityProfile,
        coverageStates: [],
        headquartersMunicipalityIbge: "3106200",
        coverageRadiusKm: 100,
      },
    ),
  );
  assert.equal(
    scoreOpportunityForProfile(
      { ...opportunity, municipalityIbge: "3170206" },
      {
        ...opportunityProfile,
        coverageStates: [],
        headquartersMunicipalityIbge: "3106200",
        coverageRadiusKm: 100,
      },
    ),
    null,
  );
  assert.ok(
    scoreOpportunityForProfile(
      { ...opportunity, state: "SP" },
      {
        ...opportunityProfile,
        coverageStates: [],
        coverageRegions: ["southeast"],
      },
    ),
  );
  assert.ok(
    scoreOpportunityForProfile(
      {
        ...opportunity,
        state: "SP",
        categories: [{ slug: "ti-telecom" }],
      },
      { ...opportunityProfile, acceptsRemote: true },
    ),
  );
  assert.ok(
    scoreOpportunityForProfile(
      { ...opportunity, state: "SP" },
      { ...opportunityProfile, coverageMode: "prioritize" },
    ),
  );
  assert.equal(
    scoreOpportunityForProfile(
      {
        ...opportunity,
        searchText: "manutenção predial preventiva",
      },
      opportunityProfile,
    ),
    null,
  );
});

test("finalidades aplicam exclusão, região estrita e bônus do perfil", () => {
  const call = {
    kind: "culture" as const,
    source: "mapas" as const,
    areas: ["audiovisual"],
    audience: null,
    opportunityType: "Edital",
    title: "Prêmio para produção com drone",
    summary: null,
    searchText: "premio para producao com drone",
    state: "MG",
  };
  const base = scoreDeclaredOpportunity(call, ["culture"], [], null);
  const boosted = scoreDeclaredOpportunity(
    call,
    ["culture"],
    [],
    opportunityProfile,
  );
  assert.ok(base && boosted && boosted.score > base.score);
  assert.equal(
    scoreDeclaredOpportunity(
      { ...call, state: "SP" },
      ["culture"],
      [],
      opportunityProfile,
    ),
    null,
  );
  assert.equal(
    scoreDeclaredOpportunity(
      { ...call, title: "Prêmio para armas", searchText: "premio para armas" },
      ["culture"],
      [],
      { ...opportunityProfile, exclusions: ["arma"] },
    ),
    null,
  );
  assert.ok(
    scoreDeclaredOpportunity(
      { ...call, state: null },
      ["culture"],
      [],
      opportunityProfile,
    ),
  );
});
