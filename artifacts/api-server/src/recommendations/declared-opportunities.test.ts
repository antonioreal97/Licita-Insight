import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
const { scoreDeclaredOpportunity: score, compareDeclaredOpportunities } =
  await import("./recommendation-service");

const profile = {
  description: "Pesquisa, consultoria e elaboração de projetos",
  offerings: ["software", "empresa", "serviços", "projetos"],
  selectedKeywords: [] as string[],
  selectedCategories: [] as string[],
  exclusions: [] as string[],
  excludedKeywords: [] as string[],
  coverageScope: "custom" as const,
  coverageStates: ["MG"],
  coverageMode: "strict" as "strict" | "prioritize",
  valueMin: null,
  valueMax: null,
};
const call = {
  kind: "culture" as const,
  source: "mapas" as const,
  installationId: "br",
  areas: [] as string[],
  areaTerms: [] as string[],
  audience: "Empresas e pessoas físicas",
  opportunityType: "Edital",
  title: "Apoio ao desenvolvimento de software",
  summary: null as string | null,
  state: null as string | null,
};

for (const [title, opportunityType] of [
  ["CONSULTORIA PARA PROJETOS CULTURAIS", "Ciclo"],
  ["WORKSHOP ELABORAÇÃO DE PROJETOS CULTURAIS CICLO 02", "Curso"],
  ["Cultura em Ação", "Programa"],
]) {
  test(`exclui ${title} sem aderência ao perfil, apesar de finalidade e público`, () => {
    const unrelated = {
      ...call,
      title: title!,
      opportunityType: opportunityType!,
      summary:
        "Pesquisa para elaboração de projetos culturais, com apoio às empresas",
      areas: ["gestao-producao", "formacao"],
    };
    assert.equal(
      score(
        unrelated,
        ["culture", "research", "funding"],
        ["company"],
        profile,
      ),
      null,
    );
    assert.equal(score(unrelated, ["culture"], ["company"], null), null);
  });
}

test("CAPES exige área ou oferta ligada ao perfil, mesmo sendo fonte de pesquisa", () => {
  const capes = {
    ...call,
    source: "capes" as const,
    kind: "funding" as const,
    title: "Programa de bolsas",
    areas: ["biologia"],
    areaTerms: ["Ciências biológicas"],
  };
  assert.equal(score(capes, ["research"], ["company"], profile), null);
  const matched = score(
    { ...capes, areas: [], areaTerms: ["Engenharia de software"] },
    ["research"],
    [],
    profile,
  );
  assert.ok(matched);
  assert.ok(
    matched.reasons.includes(
      "Área ligada ao seu perfil: Engenharia de software",
    ),
  );
  assert.ok(matched.reasons.includes("Oportunidade ligada à pesquisa"));
});

test("finalidade depende de fonte, kind ou tipo estruturado, nunca de menção no resumo", () => {
  const cultural = {
    ...call,
    summary: "Pesquisa na universidade, bolsa de apoio e inovação",
  };
  assert.equal(score(cultural, ["research"], [], profile), null);
  assert.equal(score(cultural, ["funding"], [], profile), null);
  const result = score(
    cultural,
    ["culture", "research", "funding"],
    [],
    profile,
  )!;
  assert.ok(result);
  assert.ok(!result.reasons.includes("Oportunidade ligada à pesquisa"));
  assert.ok(!result.reasons.includes("Oportunidade de fomento"));
  assert.ok(
    score(
      { ...cultural, opportunityType: "Bolsa de pesquisa" },
      ["research"],
      [],
      profile,
    ),
  );
  assert.ok(
    score({ ...cultural, kind: "innovation" }, ["research"], [], profile),
  );
  for (const source of ["capes", "cnpq", "finep"] as const)
    assert.ok(
      score({ ...call, source, kind: "funding" }, ["research"], [], profile),
    );
});

test("aderência preserva frases, ignora genéricos e não usa público, descrição ou searchText como oferta", () => {
  const unrelated = {
    ...call,
    title: "Consultoria cultural",
    audience: "Empresas de software",
    searchText: "Consultoria cultural para empresas de software",
  };
  assert.equal(score(unrelated, ["culture"], ["company"], profile), null);
  assert.equal(
    score(
      { ...call, title: "Elaboração de projetos culturais" },
      ["culture"],
      [],
      { ...profile, offerings: ["elaboração de projetos de software"] },
    ),
    null,
  );
  const matched = score(
    { ...call, title: "Elaboração de projetos de software" },
    ["culture"],
    [],
    { ...profile, offerings: ["elaboração de projetos de software"] },
  );
  assert.ok(
    matched?.reasons.includes(
      "Combina com sua oferta ou palavra-chave: elaboração de projetos de software",
    ),
  );
  assert.equal(
    score(call, ["culture"], [], {
      ...profile,
      offerings: [],
      description: "software",
    }),
    null,
  );
  assert.ok(
    score(call, ["culture"], [], {
      ...profile,
      offerings: [],
      selectedKeywords: ["software"],
    }),
  );
});

test("áreas casam com categorias escolhidas ou ofertas específicas, inclusive sinônimos culturais", () => {
  const cultural = {
    ...call,
    title: "Prêmio de criação",
    areas: ["audiovisual"],
  };
  const category = score(cultural, ["culture"], [], {
    ...profile,
    offerings: [],
    selectedCategories: ["audiovisual"],
  });
  assert.ok(
    category?.reasons.includes("Área ligada ao seu perfil: Audiovisual"),
  );
  assert.ok(
    score(cultural, ["culture"], [], {
      ...profile,
      offerings: ["produção de cinema"],
    }),
  );
  assert.equal(
    score({ ...cultural, areas: ["outras"] }, ["culture"], [], {
      ...profile,
      offerings: [],
      selectedCategories: ["outras"],
    }),
    null,
  );
});

test("só interesse aprendido qualifica; histórico e Interessa isolado não bastam", () => {
  const unrelatedProfile = { ...profile, offerings: ["drone"] };
  for (const source of [
    "search",
    "view",
    "saved",
    "interest",
    "profile_description",
  ]) {
    assert.equal(
      score(call, ["culture"], [], unrelatedProfile, {
        terms: [{ value: "software", sources: [source], weight: 100 }],
      }),
      null,
    );
  }
  const learned = score(call, ["culture"], [], unrelatedProfile, {
    terms: [{ value: "software", sources: ["interest_learned"], weight: 5 }],
  });
  assert.ok(
    learned?.reasons.includes(
      "Relacionado aos seus interesses aprendidos: software",
    ),
  );
  assert.ok(
    score(call, ["culture"], [], null, {
      terms: [
        { value: "software", label: "interest_learned:software", weight: 5 },
      ],
    }),
  );
  assert.equal(
    score(
      call,
      ["culture"],
      [],
      { ...profile, excludedKeywords: ["software"] },
      {
        terms: [
          { value: "software", sources: ["interest_learned"], weight: 5 },
        ],
      },
    ),
    null,
  );
});

test("público correspondente só dá bônus quando informado no campo audience", () => {
  const without = score(
    { ...call, audience: null, summary: "Empresas participantes" },
    ["culture"],
    ["company"],
    profile,
  )!;
  const withAudience = score(call, ["culture"], ["company"], profile)!;
  assert.ok(withAudience.score > without.score);
  assert.ok(
    withAudience.reasons.includes("Público informado na chamada: empresa"),
  );
  assert.ok(!without.reasons.some((reason) => reason.startsWith("Público")));
});

test("strict exclui UF fora e prioritize coloca qualquer chamada local antes de uma externa mais pontuada", () => {
  assert.equal(score({ ...call, state: "SP" }, ["culture"], [], profile), null);
  const priorityProfile = { ...profile, coverageMode: "prioritize" as const };
  const inside = score(
    { ...call, state: "MG", audience: null },
    ["culture"],
    [],
    priorityProfile,
  )!;
  const outside = score(
    { ...call, state: "SP", areas: ["software"] },
    ["culture"],
    ["company"],
    priorityProfile,
    {
      terms: [{ value: "software", sources: ["interest_learned"], weight: 20 }],
    },
  )!;
  assert.ok(
    outside.score > inside.score,
    "o teste precisa desafiar a ordenação por score",
  );
  assert.ok(outside.reasons.includes("Fora da sua região"));
  assert.deepEqual(
    [
      { id: "outside", ...outside },
      { id: "inside", ...inside },
    ]
      .sort(compareDeclaredOpportunities)
      .map(({ id }) => id),
    ["inside", "outside"],
  );
});

test("infere UF e município pela instalação e por city exata, inclusive no Mapa da Cultura federal", () => {
  for (const location of [
    { installationId: "rn-natal" },
    { installationId: "ce" },
    { city: "Natal" },
    { city: "Natal/RN" },
    { city: "Natal (RN)" },
  ])
    assert.equal(
      score({ ...call, ...location }, ["culture"], [], profile),
      null,
    );
  const municipal = {
    ...profile,
    coverageStates: [],
    coverageMunicipalities: ["3106200"],
  };
  assert.ok(
    score(
      { ...call, installationId: "mg-belo-horizonte" },
      ["culture"],
      [],
      municipal,
    ),
  );
  assert.equal(
    score({ ...call, city: "Uberlândia" }, ["culture"], [], municipal),
    null,
  );
  assert.ok(
    score({ ...call, city: "Belo Horizonte/MG" }, ["culture"], [], municipal),
  );
});

test("cobertura usa raio, macrorregião e modo legado; alcance federal sem localização permanece elegível", () => {
  assert.ok(
    score({ ...call, city: "Nova Lima", state: "MG" }, ["culture"], [], {
      ...profile,
      coverageStates: [],
      headquartersMunicipalityIbge: "3106200",
      coverageRadiusKm: 50,
    }),
  );
  assert.equal(
    score({ ...call, city: "Uberlândia", state: "MG" }, ["culture"], [], {
      ...profile,
      coverageStates: [],
      headquartersMunicipalityIbge: "3106200",
      coverageRadiusKm: 50,
    }),
    null,
  );
  assert.ok(
    score({ ...call, state: "SP" }, ["culture"], [], {
      ...profile,
      coverageStates: [],
      coverageRegions: ["southeast"],
    }),
  );
  const legacy = score({ ...call, state: "SP" }, ["culture"], [], {
    ...profile,
    coverageScope: "states",
    coverageMode: undefined,
  });
  assert.ok(legacy?.reasons.includes("Fora da sua região"));
  for (const source of ["mapas", "capes", "cnpq", "finep"] as const) {
    const national = score(
      { ...call, source },
      ["culture", "research"],
      [],
      profile,
    );
    assert.ok(national);
    assert.equal(national.regionPriority, 1);
    assert.ok(!national.reasons.includes("Fora da sua região"));
  }
});

test("não inventa UF para município ambíguo ou citação no texto; prioriza dados explícitos", () => {
  const unknown = score(
    { ...call, city: "Santa Luzia", summary: "Evento de São Paulo" },
    ["culture"],
    [],
    profile,
  )!;
  assert.equal(unknown.regionPriority, 1);
  assert.ok(
    score(
      {
        ...call,
        installationId: "rn-natal",
        city: "Belo Horizonte",
        state: "MG",
      },
      ["culture"],
      [],
      profile,
    ),
  );
});
