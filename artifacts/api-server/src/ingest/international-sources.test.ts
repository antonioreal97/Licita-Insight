import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectInternationalOnce,
  internationalSourcesFromEnv,
} from "./international-client";
import {
  euFacetRequest,
  euSearchRequest,
  parseEuFacets,
  parseEuPage,
} from "./eu-ft-parsers";
import { placeFromName, languageCode } from "./international-countries";
import type { InternationalOpportunityDraft } from "./international-draft";
import {
  euEligibility,
  idbEligibility,
  worldBankEligibility,
} from "./international-eligibility";
import {
  fixtureFetcher,
  FIXTURE_NOW,
  internationalFixture,
  internationalFixtureJson,
  internationalResponse,
} from "./international-fixtures";
import {
  INTERNATIONAL_USER_AGENT,
  InternationalRateLimitError,
  requestJson,
  retryAfterMs,
} from "./international-http";
import { internationalSchedule } from "./international-schedule";
import {
  IDB_USER_AGENT,
  idbPageUrl,
  idbResourceId,
  parseIdbPage,
} from "./idb-parsers";
import { parseWorldBankPage, worldBankPageUrl } from "./worldbank-parsers";

const byId = (drafts: InternationalOpportunityDraft[]) =>
  new Map(drafts.map((draft) => [draft.externalId, draft]));

const worldBank = () =>
  parseWorldBankPage(
    internationalFixtureJson("worldbank-procnotices.json"),
    FIXTURE_NOW,
  );

const europe = () =>
  parseEuPage(
    internationalFixtureJson("eu-ft-search.json"),
    parseEuFacets(internationalFixtureJson("eu-ft-facet.json")),
    FIXTURE_NOW,
  );

test("Banco Mundial: só avisos com prazo vigente viram oportunidade, com tipo, país, projeto e método", () => {
  const page = worldBank();
  assert.equal(page.total, 660);
  assert.equal(page.rows, 12);
  // OP00404078 fechou em 10/10, um dia antes da gravação.
  assert.equal(page.skipped, 1);
  assert.equal(page.drafts.length, 11);
  assert.ok(!byId(page.drafts).has("OP00404078"));

  const uganda = byId(page.drafts).get("OP00474363")!;
  assert.equal(uganda.id, "worldbank-OP00474363");
  assert.equal(uganda.scope, "international");
  assert.equal(uganda.kind, "procurement");
  assert.equal(uganda.agency, "Banco Mundial");
  assert.equal(uganda.opportunityType, "Serviços (não consultoria)");
  assert.equal(uganda.country, "UG");
  assert.equal(uganda.countryName, "Uganda");
  assert.equal(uganda.region, "africa");
  assert.equal(uganda.language, "en");
  assert.equal(uganda.titlePt, null);
  assert.equal(
    uganda.organizationName,
    "National Information and Technology Authority - Uganda",
  );
  assert.equal(
    uganda.originName,
    "P171305 · Uganda Digital Acceleration Project - GovNet",
  );
  assert.equal(uganda.status, "open");
  assert.equal(
    uganda.sourceUrl,
    "https://projects.worldbank.org/en/projects-operations/procurement-detail/OP00474363",
  );
  assert.match(uganda.summary!, /^Convite à licitação de serviços \(não consultoria\) em Uganda, método Request for Bids/);
  assert.match(uganda.summary!, /Aviso em inglês\./);
  const details = uganda.raw.details as Array<{ label: string; value: string }>;
  assert.deepEqual(
    details.find((detail) => detail.label === "Método"),
    { label: "Método", value: "Request for Bids" },
  );
  assert.ok(details.some((detail) => detail.label === "Referência"));
});

test("Banco Mundial: hora local vira horário exato quando o país tem um fuso só", () => {
  const drafts = byId(worldBank().drafts);
  // Uganda: 27/10 11:00 em Kampala (UTC+3) = 08:00 UTC = 05:00 em Brasília.
  const uganda = drafts.get("OP00474363")!;
  assert.equal(uganda.deadlinePrecision, "datetime");
  assert.equal(uganda.deadlineTimeZone, "Africa/Kampala");
  assert.equal(uganda.deadlineOriginal, "2026-10-27 11:00");
  assert.equal(uganda.registrationTo!.toISOString(), "2026-10-27T08:00:00.000Z");

  // Indonésia tem três fusos: fica o dia, a hora não é inventada.
  const indonesia = drafts.get("OP00474373")!;
  assert.equal(indonesia.deadlinePrecision, "date");
  assert.equal(indonesia.deadlineTimeZone, null);
  assert.equal(indonesia.deadlineOriginal, "2026-10-26 12:00");
  assert.equal(
    indonesia.registrationTo!.toISOString(),
    "2026-10-27T11:59:59.000Z",
  );

  // Brasil também tem mais de um fuso.
  const acre = drafts.get("OP00472237")!;
  assert.equal(acre.country, "BR");
  assert.equal(acre.deadlinePrecision, "date");
  assert.equal(acre.deadlineOriginal, "2026-10-20 08:00");
});

test("Banco Mundial: elegibilidade condicional por padrão, sim só com concorrência internacional", () => {
  const drafts = byId(worldBank().drafts);
  const rule = (id: string) => drafts.get(id)!.brazilEligibility;

  // "international competitive procurement" (inglês) e "Mise en Concurrence internationale (AOI)" (francês).
  assert.equal(rule("OP00464713").status, "yes");
  assert.equal(rule("OP00464713").rule, "wb-international-open");
  assert.equal(rule("OP00459819").status, "yes");

  // "Open National", "APPEL D'OFFRES OUVERT NATIONAL", "National Competitive Bidding (NCB)", "National Shopping".
  for (const id of ["OP00474383", "OP00469128", "OP00474373", "OP00452338"]) {
    assert.equal(rule(id).status, "no", id);
    assert.equal(rule(id).rule, "wb-national-other-country", id);
  }
  assert.match(rule("OP00474383").reason, /Nigéria/);

  // Sem menção ao mercado: condicional, com o motivo de cada método.
  assert.equal(rule("OP00474363").status, "conditional");
  assert.equal(rule("OP00474363").rule, "wb-default");
  assert.equal(rule("OP00474359").rule, "wb-consulting-firms");

  // "Coordonnateur National" no fim do texto e o método "Individual Consultant Selection" não formam
  // "national individual consultant".
  assert.equal(rule("OP00473732").status, "conditional");
  assert.equal(rule("OP00473732").rule, "wb-individual-consultant");

  // Projetos no Brasil ficam condicionais e são destacados pelo país.
  assert.equal(drafts.get("OP00471978")!.country, "BR");
  assert.equal(rule("OP00471978").status, "conditional");
  assert.equal(drafts.get("OP00471978")!.language, "pt");
  assert.equal(drafts.get("OP00471978")!.translationSource, "source");
  assert.equal(
    drafts.get("OP00471978")!.titlePt,
    drafts.get("OP00471978")!.titleOriginal,
  );
});

test("Banco Mundial: nenhum contato pessoal é pedido nem guardado", () => {
  const url = worldBankPageUrl(0, FIXTURE_NOW);
  const fields = new URL(url).searchParams.get("fl")!.split(",");
  for (const field of [
    "contact_name",
    "contact_email",
    "contact_phone_no",
    "contact_address",
  ])
    assert.ok(!fields.includes(field), field);
  assert.equal(new URL(url).searchParams.get("deadline_strdate"), "2026-10-10");
  for (const draft of worldBank().drafts) {
    const stored = JSON.stringify(draft.raw);
    assert.doesNotMatch(stored, /notice_text|contact_|@/);
    assert.doesNotMatch(draft.summary ?? "", /@/);
  }
});

test("regras do Banco Mundial: casos do relatório de pesquisa", () => {
  const base = {
    methodCode: "RFB",
    methodName: "Request for Bids",
    country: "KE",
    countryName: "Quênia",
  };
  assert.equal(
    worldBankEligibility({
      ...base,
      texts: ["Bidding will be conducted through international competitive procurement"],
    }).status,
    "yes",
  );
  assert.equal(
    worldBankEligibility({
      ...base,
      texts: ["Licitación Pública Nacional (LPN) No. 12/2026"],
    }).status,
    "no",
  );
  // Processo nacional em projeto no Brasil: não é "não", mas também não é concorrência internacional.
  const brazil = worldBankEligibility({
    ...base,
    country: "BR",
    countryName: "Brasil",
    texts: ["Licitação Pública Nacional nº 3/2026"],
  });
  assert.equal(brazil.status, "conditional");
  assert.equal(brazil.rule, "wb-national-brazil");
  // Os dois sinais no mesmo aviso: não dá para decidir.
  assert.equal(
    worldBankEligibility({
      ...base,
      texts: ["Open International for lot 1; National Competitive Bidding for lot 2"],
    }).rule,
    "wb-ambiguous-market",
  );
  assert.equal(
    worldBankEligibility({
      methodCode: "INDV",
      methodName: "Individual Consultant Selection",
      country: "KE",
      countryName: "Quênia",
      texts: ["Recruitment of a national consultant for the PIU"],
    }).status,
    "no",
  );
  assert.equal(
    worldBankEligibility({
      methodCode: "DIR",
      methodName: "Direct Selection",
      country: "KE",
      countryName: "Quênia",
      texts: ["Supply of spare parts"],
    }).rule,
    "wb-direct-selection",
  );
});

test("Funding & Tenders: só chamadas abertas ou previstas com prazo à frente", () => {
  const page = europe();
  assert.equal(page.total, 1197);
  assert.equal(page.rows, 14);
  // O índice ainda marca como abertos um tópico com prazo de 2023 e duas chamadas sem prazo.
  assert.equal(page.skipped, 3);
  const drafts = byId(page.drafts);
  assert.ok(!drafts.has("CEF-E-2023-PCI-STUDIES"));
  assert.ok(!drafts.has("prospect-167264"));
  assert.ok(!drafts.has("prospect-170893"));
  assert.equal(page.drafts.length, 11);

  const topic = drafts.get("HORIZON-CL5-2027-07-D3-17")!;
  assert.equal(topic.id, "eu_ft-HORIZON-CL5-2027-07-D3-17");
  assert.equal(topic.kind, "innovation");
  assert.equal(topic.agency, "União Europeia");
  assert.equal(topic.organizationName, "Comissão Europeia");
  assert.equal(topic.originName, "Horizon Europe (HORIZON) · HORIZON-CL5-2027-07");
  assert.equal(topic.opportunityType, "Subvenção");
  assert.equal(topic.status, "upcoming");
  assert.equal(topic.region, "europa");
  assert.equal(topic.language, "en");
  assert.equal(topic.currency, "EUR");
  assert.ok(topic.amountOriginal! > 0);
  assert.match(topic.summary!, /^Subvenção do programa Horizon Europe \(HORIZON\) \(HORIZON Innovation Actions\)\. Orçamento: /);
  assert.match(topic.summary!, /Abertura prevista para 04\/08\/2027/);
  assert.equal(
    topic.sourceUrl,
    "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-CL5-2027-07-D3-17",
  );
  // Prazo sem hora: fica o dia, no fuso de Bruxelas.
  assert.equal(topic.deadlinePrecision, "date");
  assert.equal(topic.deadlineTimeZone, "Europe/Brussels");
  assert.equal(topic.deadlineOriginal, "2027-12-01");
  assert.equal(topic.registrationTo!.toISOString(), "2027-12-01T22:59:59.000Z");
});

test("Funding & Tenders: a hora do portal é de Bruxelas, mesmo rotulada +0000", () => {
  const drafts = byId(europe().drafts);
  // Eurostars: "04 March 2027 14:00 (Brussels time)" no texto; a API manda 14:00:00.000+0000.
  const eurostars = drafts.get("cascade-15342")!;
  assert.equal(eurostars.deadlineOriginal, "2027-03-04 14:00");
  assert.equal(eurostars.deadlinePrecision, "datetime");
  assert.equal(eurostars.registrationTo!.toISOString(), "2027-03-04T13:00:00.000Z");
  assert.equal(eurostars.opportunityType, "Financiamento em cascata");
  assert.equal(eurostars.kind, "funding");
  assert.equal(eurostars.originName, "European Partnership on Innovative SMEs");
});

test("Funding & Tenders: chamadas em cascata do mesmo tópico não se sobrepõem", () => {
  const drafts = byId(europe().drafts);
  const first = drafts.get("cascade-15545")!;
  const second = drafts.get("cascade-15921")!;
  assert.ok(first && second);
  assert.equal(first.raw.identifier, second.raw.identifier);
  assert.notEqual(first.titleOriginal, second.titleOriginal);
});

test("Funding & Tenders: participar e receber financiamento são respostas separadas", () => {
  const drafts = byId(europe().drafts);
  const answers = (id: string) => {
    const draft = drafts.get(id)!;
    return [
      draft.brazilEligibility.status,
      draft.brazilEligibility.rule,
      draft.brazilFunding!.status,
      draft.brazilFunding!.rule,
    ];
  };
  // Horizon colaborativo: entra em consórcio, sem verba da UE.
  assert.deepEqual(answers("HORIZON-CL5-2027-07-D3-17"), [
    "conditional",
    "eu-horizon-consortium",
    "no",
    "eu-third-country-not-funded",
  ]);
  assert.match(
    drafts.get("HORIZON-CL5-2027-07-D3-17")!.brazilFunding!.reason,
    /CNPq\/FINEP\/CONFAP/,
  );
  // "participation is limited to legal entities established in Member States and Associated Countries".
  assert.deepEqual(answers("HORIZON-HLTH-2027-03-TOOL-08"), [
    "no",
    "eu-restricted",
    "no",
    "eu-restricted",
  ]);
  // A chamada cita o Brasil: pode haver exceção de financiamento.
  assert.deepEqual(answers("HORIZON-CL5-2027-01-D1-13"), [
    "conditional",
    "eu-horizon-consortium",
    "conditional",
    "eu-mentions-brazil",
  ]);
  // ERC: bolsa individual, pesquisador de qualquer nacionalidade.
  assert.deepEqual(answers("ERC-2027-COG"), [
    "yes",
    "eu-individual-researcher",
    "yes",
    "eu-individual-researcher",
  ]);
  // MSCA Doctoral Networks: parceiro associado, sem financiamento.
  assert.deepEqual(answers("HORIZON-MSCA-2026-DN-01-01"), [
    "conditional",
    "eu-msca-partner",
    "no",
    "eu-third-country-not-funded",
  ]);
  assert.deepEqual(answers("EDF-EDIP-P-2026-2027-FNLC-SA-SEAP"), [
    "no",
    "eu-defence-fund",
    "no",
    "eu-defence-fund",
  ]);
  // Programa sem regra para países terceiros conhecida: a confirmar, sem financiamento.
  assert.deepEqual(answers("DIGITAL-ECCC-2027-DEPLOY-CYBER-11-AI4SME"), [
    "unknown",
    "eu-programme-countries",
    "no",
    "eu-programme-countries",
  ]);
  assert.deepEqual(answers("cascade-15342"), [
    "unknown",
    "eu-cascade",
    "unknown",
    "eu-cascade",
  ]);
  assert.deepEqual(answers("prospect-187670"), [
    "unknown",
    "eu-external-action",
    "unknown",
    "eu-external-action",
  ]);
});

test("Funding & Tenders: ação externa traz região e só metadados dos documentos", () => {
  const call = byId(europe().drafts).get("prospect-187670")!;
  assert.equal(call.opportunityType, "Chamada de ação externa");
  assert.equal(call.kind, "funding");
  assert.equal(call.region, "europa");
  assert.equal(call.countryName, "Países em pré-adesão à UE");
  assert.equal(call.amountOriginal, 3430000);
  assert.equal(call.currency, "EUR");
  assert.equal(call.deadlineOriginal, "2027-01-15 11:00");
  assert.equal(call.registrationTo!.toISOString(), "2027-01-15T10:00:00.000Z");
  assert.equal(call.documents.length, 3);
  assert.deepEqual(Object.keys(call.documents[0]!).sort(), [
    "mediaType",
    "title",
    "url",
  ]);
  assert.equal(call.documents[0]!.title, "Guidelines for applicants");
  assert.match(call.documents[0]!.url, /^https:\/\/webgate\.ec\.europa\.eu\//);
});

test("Funding & Tenders: resultado de outro datasource (evento, notícia) é ignorado", () => {
  const page = parseEuPage(
    {
      totalResults: 2,
      results: [
        {
          metadata: {
            type: ["6"],
            identifier: ["EVENT-123"],
            status: ["31094502"],
            title: ["Info day"],
            deadlineDate: ["2027-01-01T17:00:00.000+0000"],
          },
        },
        { metadata: { title: ["No type at all"] } },
      ],
    },
    new Map(),
    FIXTURE_NOW,
  );
  assert.equal(page.drafts.length, 0);
  assert.equal(page.skipped, 2);
});

test("regras da UE: Twinning, cascata restrita e programa que cita a América Latina", () => {
  const twinning = euEligibility({
    type: "external",
    identifier: "EuropeAid/170893/ID/ACT/RS",
    programme: "EU External Action - Prospect (RELEX-PROSPECT)",
    typesOfAction: [],
    contractType: "Twinning",
    texts: [],
  });
  assert.equal(twinning.participation.status, "no");
  assert.equal(twinning.funding.rule, "eu-twinning");

  const cascade = euEligibility({
    type: "cascade",
    identifier: "HORIZON-CL4-2023-HUMAN-01-11",
    programme: "Horizon Europe (HORIZON)",
    typesOfAction: [],
    texts: [
      "Applicants must be established in an EU Member State or a Horizon Europe Associated Country.",
    ],
  });
  assert.equal(cascade.participation.status, "no");
  assert.equal(cascade.participation.rule, "eu-cascade-restricted");

  const postdoc = euEligibility({
    type: "topic",
    identifier: "HORIZON-MSCA-2027-PF-01-01",
    programme: "Horizon Europe (HORIZON)",
    typesOfAction: ["HORIZON TMA MSCA Postdoctoral Fellowships - Global Fellowships"],
    texts: [],
  });
  assert.equal(postdoc.participation.status, "yes");
  assert.equal(postdoc.funding.status, "yes");

  const life = euEligibility({
    type: "topic",
    identifier: "LIFE-2027-SAP-NAT",
    programme: "Programme for the Environment and Climate Action (LIFE)",
    typesOfAction: [],
    texts: ["Cooperation with partners in Latin America is encouraged."],
  });
  assert.equal(life.participation.status, "conditional");
  assert.equal(life.participation.rule, "eu-mentions-brazil");
});

test("países, regiões e idiomas das fontes", () => {
  assert.deepEqual(placeFromName("Congo, Democratic Republic of"), {
    country: "CD",
    countryName: "República Democrática do Congo",
    region: "africa",
    timeZone: null,
  });
  assert.equal(placeFromName("Turkiye").country, "TR");
  assert.equal(placeFromName("Brazil").timeZone, null);
  assert.equal(placeFromName("Brazil").countryName, "Brasil");
  assert.deepEqual(placeFromName("Western and Central Africa"), {
    country: null,
    countryName: "África Ocidental e Central",
    region: "africa",
    timeZone: null,
  });
  // Nome fora da tabela: fica como a fonte publicou, sem região e sem fuso.
  assert.deepEqual(placeFromName("Atlantis"), {
    country: null,
    countryName: "Atlantis",
    region: null,
    timeZone: null,
  });
  assert.equal(languageCode("Spanish; Castilian"), "es");
  assert.equal(languageCode("French"), "fr");
  assert.equal(languageCode("Klingon"), null);
});

test("coleta: User-Agent honesto, robots consultado e poucas requisições", async () => {
  assert.match(
    INTERNATIONAL_USER_AGENT,
    /^PardalDigital\/\S+ \(\+https:\/\/pardaldigital\.com; contato@pardaldigital\.com\)$/,
  );
  const { fetcher, requests } = fixtureFetcher();
  const sources = await collectInternationalOnce({
    fetcher,
    now: FIXTURE_NOW,
    delayMs: 0,
  });
  assert.deepEqual(
    sources.map(({ drafts: _drafts, ...summary }) => summary),
    [
      {
        source: "worldbank",
        outcome: "ok",
        complete: true,
        requests: 2,
        listed: 660,
        skipped: 1,
        count: 11,
        message: null,
      },
      {
        source: "eu_ft",
        outcome: "ok",
        complete: true,
        requests: 3,
        listed: 1197,
        skipped: 3,
        count: 11,
        message: null,
      },
      {
        source: "idb",
        outcome: "ok",
        complete: true,
        requests: 3,
        listed: 25329,
        skipped: 4,
        count: 11,
        message: null,
      },
    ],
  );
  assert.deepEqual(
    requests.map((request) => `${request.method ?? "GET"} ${new URL(request.url).host}${new URL(request.url).pathname}`),
    [
      "GET search.worldbank.org/robots.txt",
      "GET search.worldbank.org/api/v2/procnotices",
      "GET api.tech.ec.europa.eu/robots.txt",
      "POST api.tech.ec.europa.eu/search-api/prod/rest/facet",
      "POST api.tech.ec.europa.eu/search-api/prod/rest/search",
      "GET data.iadb.org/robots.txt",
      "GET data.iadb.org/api/3/action/package_show",
      "GET data.iadb.org/api/3/action/datastore_search",
    ],
  );
  // O BID recebe exatamente a identidade informada no pedido de autorização; as outras fontes, a padrão.
  for (const request of requests)
    assert.equal(
      request.userAgent,
      request.url.startsWith("https://data.iadb.org/") ? IDB_USER_AGENT : undefined,
      request.url,
    );
  // A consulta usa a DSL documentada: tipos 1, 2 e 8, abertos e previstos, ordem estável.
  assert.deepEqual(euSearchRequest(1).jsonParts.query, {
    bool: {
      must: [
        { terms: { type: ["1", "2", "8"] } },
        { terms: { status: ["31094501", "31094502"] } },
      ],
    },
  });
  assert.deepEqual(euSearchRequest(1).jsonParts.sort, {
    order: "ASC",
    field: "identifier",
  });
  assert.match(euFacetRequest().url, /\/facet\?apiKey=SEDIA/);
});

test("coleta: robots.txt que proíbe o endereço deixa a fonte de fora, sem contorno", async () => {
  const { fetcher, requests } = fixtureFetcher([
    [
      "https://search.worldbank.org/robots.txt",
      () => internationalResponse(200, "User-agent: *\nDisallow: /api/\n"),
    ],
    [
      "https://api.tech.ec.europa.eu/robots.txt",
      () => internationalResponse(503, "unavailable"),
    ],
  ]);
  const [worldbank, eu] = await collectInternationalOnce({
    fetcher,
    now: FIXTURE_NOW,
    delayMs: 0,
    wait: async () => undefined,
  });
  assert.equal(worldbank!.outcome, "blocked_by_robots");
  assert.equal(worldbank!.count, 0);
  assert.equal(worldbank!.complete, false);
  // robots.txt que não responde não é permissão: a fonte fica para o próximo ciclo.
  assert.equal(eu!.outcome, "failed");
  assert.ok(!requests.some((request) => request.url.includes("procnotices")));
  assert.ok(!requests.some((request) => request.url.includes("/rest/search")));
});

test("coleta: Retry-After é respeitado e, acima do teto, a fonte espera o próximo ciclo", async () => {
  const waits: number[] = [];
  let calls = 0;
  const answered = await requestJson(
    async () => {
      calls += 1;
      return calls === 1
        ? internationalResponse(429, "", "7")
        : internationalResponse(200, '{"ok":true}');
    },
    { url: "https://search.worldbank.org/api/v2/procnotices" },
    { wait: async (ms) => void waits.push(ms) },
  );
  assert.deepEqual(answered, { ok: true });
  assert.deepEqual(waits, [7_000]);
  assert.equal(calls, 2);

  await assert.rejects(
    requestJson(
      async () => internationalResponse(429, "", "3600"),
      { url: "https://search.worldbank.org/api/v2/procnotices" },
      { wait: async () => assert.fail("não deve esperar uma hora") },
    ),
    InternationalRateLimitError,
  );
  assert.equal(retryAfterMs("120", FIXTURE_NOW), 120_000);
  assert.equal(
    retryAfterMs("Sun, 11 Oct 2026 21:21:00 GMT", FIXTURE_NOW),
    60_000,
  );
  assert.equal(retryAfterMs("soon", FIXTURE_NOW), null);

  const { fetcher } = fixtureFetcher([
    [
      "https://search.worldbank.org/api/v2/procnotices",
      () => internationalResponse(429, "", "3600"),
    ],
  ]);
  const [worldbank, eu] = await collectInternationalOnce({
    fetcher,
    now: FIXTURE_NOW,
    delayMs: 0,
    wait: async () => undefined,
  });
  assert.equal(worldbank!.outcome, "rate_limited");
  // Uma fonte limitada não derruba a outra.
  assert.equal(eu!.outcome, "ok");
});

test("coleta: página seguinte que falha mantém o que foi lido e não permite encerrar o resto", async () => {
  const notices = JSON.parse(
    internationalFixture("worldbank-procnotices.json"),
  ) as { procnotices: Array<Record<string, unknown>> };
  const full = {
    total: "250",
    procnotices: Array.from({ length: 100 }, (_unused, index) => ({
      ...notices.procnotices[0]!,
      id: `OP${String(index).padStart(8, "0")}`,
    })),
  };
  const { fetcher } = fixtureFetcher([
    [
      "https://search.worldbank.org/api/v2/procnotices",
      (request) =>
        new URL(request.url).searchParams.get("os") === "0"
          ? internationalResponse(200, JSON.stringify(full))
          : internationalResponse(500, "boom"),
    ],
  ]);
  const [worldbank] = await collectInternationalOnce({
    fetcher,
    now: FIXTURE_NOW,
    delayMs: 0,
    sources: ["worldbank"],
  });
  assert.equal(worldbank!.outcome, "partial");
  assert.equal(worldbank!.complete, false);
  assert.equal(worldbank!.count, 100);
  assert.match(worldbank!.message!, /Página 2 falhou/);
});

test("flags: INTERNATIONAL_COLLECT desligado por padrão e fora da janela noturna e das 06:00", () => {
  assert.deepEqual(internationalSchedule({}), { enabled: false });
  assert.deepEqual(internationalSchedule({ INTERNATIONAL_COLLECT: "false" }), {
    enabled: false,
  });
  assert.deepEqual(internationalSchedule({ INTERNATIONAL_COLLECT: "true" }), {
    enabled: true,
    hour: 10,
  });
  assert.deepEqual(
    internationalSchedule({ INTERNATIONAL_COLLECT: "true", INTERNATIONAL_HOUR: "14" }),
    { enabled: true, hour: 14 },
  );
  for (const hour of ["0", "3", "5", "6", "24", "7.5", "dez"])
    assert.throws(
      () =>
        internationalSchedule({
          INTERNATIONAL_COLLECT: "true",
          INTERNATIONAL_HOUR: hour,
        }),
      /INTERNATIONAL_HOUR must be an integer from 7 to 23/,
      hour,
    );
  assert.deepEqual(internationalSourcesFromEnv({}), ["worldbank", "eu_ft", "idb"]);
  assert.deepEqual(
    internationalSourcesFromEnv({ INTERNATIONAL_SOURCES: "eu_ft" }),
    ["eu_ft"],
  );
  assert.throws(
    () => internationalSourcesFromEnv({ INTERNATIONAL_SOURCES: "worldbank,ungm" }),
    /received "ungm"/,
  );
});

const idb = () =>
  parseIdbPage(internationalFixtureJson("idb-notices.json"), FIXTURE_NOW);

test("BID: avisos específicos e manifestações de interesse com prazo vigente, com projeto, método e link oficial", () => {
  const page = idb();
  assert.equal(page.total, 25329);
  assert.equal(page.rows, 15);
  // Aviso geral de aquisições (prazo de 2029) e três avisos que fecharam antes de 11/10.
  assert.equal(page.skipped, 4);
  assert.equal(page.drafts.length, 11);
  // A página chegou a prazos anteriores a ontem: as seguintes só têm avisos encerrados.
  assert.equal(page.done, true);
  const drafts = byId(page.drafts);
  for (const id of ["34717", "39100", "39153", "38772"])
    assert.ok(!drafts.has(id), id);

  const terminal = drafts.get("39272")!;
  assert.equal(terminal.id, "idb-39272");
  assert.equal(terminal.source, "idb");
  assert.equal(terminal.installationId, "idb");
  assert.equal(terminal.scope, "international");
  assert.equal(terminal.kind, "procurement");
  assert.equal(terminal.agency, "BID");
  assert.equal(terminal.organizationName, "Banco Interamericano de Desenvolvimento (BID)");
  assert.equal(terminal.opportunityType, "Obras");
  assert.equal(terminal.country, "SV");
  assert.equal(terminal.region, "america-latina");
  assert.equal(terminal.language, "es");
  assert.equal(terminal.status, "open");
  assert.equal(terminal.amountOriginal, null);
  assert.equal(
    terminal.originName,
    "ES-L1173 · Programa de Modernización del Aeropuerto Internacional de El Salvador",
  );
  assert.equal(
    terminal.sourceUrl,
    "https://idbdocs.iadb.org/wsdocs/getdocument.aspx?docnum=EZIDB0003440-1039777545-105",
  );
  assert.equal(terminal.registrationFrom!.toISOString(), "2026-10-08T03:00:00.000Z");
  // Prazo só com o dia: o fim do dia em San Salvador (UTC−6).
  assert.equal(terminal.deadlinePrecision, "date");
  assert.equal(terminal.deadlineTimeZone, "America/El_Salvador");
  assert.equal(terminal.deadlineOriginal, "2026-11-20");
  assert.equal(terminal.registrationTo!.toISOString(), "2026-11-21T05:59:59.000Z");
  assert.match(
    terminal.summary!,
    /^Aviso específico de aquisição de obras em El Salvador, método International Competitive Bidding, no projeto Programa de Modernización/,
  );
  assert.deepEqual(
    (terminal.raw.details as Array<{ label: string; value: string }>).map(
      (detail) => detail.label,
    ),
    ["Tipo de aviso", "Método", "Operação", "Setor", "País do projeto", "Publicado em"],
  );
  assert.deepEqual(
    (terminal.raw.details as Array<{ label: string; value: string }>).slice(3, 5),
    [
      { label: "Setor", value: "Transport" },
      { label: "País do projeto", value: "El Salvador" },
    ],
  );
  assert.match(terminal.searchText, /banco interamericano de desenvolvimento/);
  assert.match(terminal.searchText, /6073\/oc-es/);

  // Equador tem mais de um fuso: fica o dia, encerrado só quando acabou em toda a Terra.
  const ecuador = drafts.get("39139")!;
  assert.equal(ecuador.deadlineTimeZone, null);
  assert.equal(ecuador.registrationTo!.toISOString(), "2026-11-12T11:59:59.000Z");

  // Emenda continua sendo um aviso oficial com prazo próprio, marcada como tal.
  const bahamas = drafts.get("39285")!;
  assert.equal(bahamas.language, "en");
  assert.equal(bahamas.raw.amendment, true);
  assert.match(bahamas.summary!, /Emenda a um aviso já publicado/);
  assert.deepEqual(
    (bahamas.raw.details as Array<{ label: string; value: string }>)[0],
    { label: "Tipo de aviso", value: "Aviso específico de aquisição (emenda)" },
  );
  assert.equal(drafts.get("39006")!.raw.amendment, true);
  assert.equal(drafts.get("39007")!.raw.amendment, false);
});

test("BID: elegibilidade pela regra dos países-membros, com restrição nacional a confirmar", () => {
  const drafts = byId(idb().drafts);
  const rule = (id: string) => drafts.get(id)!.brazilEligibility;
  assert.equal(rule("39272").status, "yes");
  assert.equal(rule("39272").rule, "idb-member-country");
  assert.match(rule("39272").reason, /48 países-membros/);
  assert.equal(drafts.get("39272")!.brazilFunding, null);

  // "National Competitive Bidding" fora do Brasil: o aviso pode limitar a disputa ao país do projeto.
  assert.equal(rule("39196").status, "unknown");
  assert.equal(rule("39196").rule, "idb-national-restriction");
  assert.match(rule("39196").reason, /Peru/);
  // Fecha em 12/10 em San Salvador: ainda aberto no instante da gravação.
  assert.equal(rule("39214").rule, "idb-national-restriction");
  assert.equal(drafts.get("39214")!.registrationTo!.toISOString(), "2026-10-13T05:59:59.000Z");

  // Projeto no Brasil: português da fonte, sem tradução, consultoria por manifestação de interesse.
  const para = drafts.get("39007")!;
  assert.equal(para.country, "BR");
  assert.equal(para.language, "pt");
  assert.equal(para.translationSource, "source");
  assert.equal(para.titlePt, para.titleOriginal);
  assert.equal(para.opportunityType, "Consultoria");
  assert.equal(rule("39007").status, "yes");

  assert.deepEqual(
    idbEligibility({
      methodName: "National Competitive Bidding",
      country: "BR",
      countryName: "Brasil",
      texts: ["Obras de saneamento"],
    }),
    {
      status: "yes",
      rule: "idb-national-brazil",
      reason:
        "Processo nacional de projeto no Brasil, financiado pelo BID: aberto a fornecedores estabelecidos no país. Confira a habilitação exigida no aviso.",
    },
  );
  assert.equal(
    idbEligibility({
      methodName: null,
      country: "CO",
      countryName: "Colômbia",
      texts: ["Licitación Pública Nacional No. 4/2026"],
    }).status,
    "unknown",
  );
});

test("BID: tabela do dataset via package_show e consulta paginada só com as colunas usadas", () => {
  const resourceId = idbResourceId(internationalFixtureJson("idb-package.json"));
  assert.equal(resourceId, "856aabfd-2c6a-48fb-a8b8-19f3ff443618");
  assert.throws(
    () => idbResourceId({ success: true, result: { resources: [{ id: "x", datastore_active: false }] } }),
    /datastore_active/,
  );
  const url = new URL(idbPageUrl(resourceId, 200));
  assert.equal(url.pathname, "/api/3/action/datastore_search");
  assert.equal(url.searchParams.get("offset"), "200");
  assert.equal(url.searchParams.get("limit"), "100");
  assert.equal(url.searchParams.get("sort"), "deadline desc, _id asc");
  assert.deepEqual(JSON.parse(url.searchParams.get("filters")!), {
    type: ["SPECIFIC", "EOI"],
  });
  assert.ok(!url.searchParams.get("fields")!.includes("ezshareid"));
  for (const draft of idb().drafts)
    assert.doesNotMatch(JSON.stringify(draft.raw), /documenturl|@/);
});

const idbRecords = () =>
  (
    internationalFixtureJson("idb-notices.json") as {
      result: { records: Array<Record<string, unknown>> };
    }
  ).result.records;

/** A page of 100 copies of an open notice; `lastDeadline` replaces the deadline of the last one. */
const idbFullPage = (offset: number, lastDeadline?: string) =>
  JSON.stringify({
    success: true,
    result: {
      total: 25329,
      records: Array.from({ length: 100 }, (_unused, index) => ({
        ...idbRecords().find((record) => record.noticeid === "39272"),
        noticeid: String(offset + index),
        deadline: index === 99 && lastDeadline ? lastDeadline : "2026-12-01",
      })),
    },
  });

const offsetOf = (url: string) =>
  Number(new URL(url).searchParams.get("offset"));

test("BID: a leitura para na página que chega a prazos vencidos e respeita o teto de páginas", async () => {
  const { fetcher, requests } = fixtureFetcher([
    [
      "https://data.iadb.org/api/3/action/datastore_search",
      (request) =>
        internationalResponse(
          200,
          idbFullPage(offsetOf(request.url), offsetOf(request.url) === 100 ? "2026-09-30" : undefined),
        ),
    ],
  ]);
  const [read] = await collectInternationalOnce({
    fetcher,
    now: FIXTURE_NOW,
    delayMs: 0,
    sources: ["idb"],
  });
  assert.equal(read!.outcome, "ok");
  assert.equal(read!.complete, true);
  assert.equal(read!.requests, 4);
  assert.equal(read!.count, 199);
  assert.equal(read!.skipped, 1);
  assert.deepEqual(
    requests.filter((request) => request.url.includes("datastore_search")).map((request) => offsetOf(request.url)),
    [0, 100],
  );

  const endless = fixtureFetcher([
    [
      "https://data.iadb.org/api/3/action/datastore_search",
      (request) => internationalResponse(200, idbFullPage(offsetOf(request.url))),
    ],
  ]);
  const [capped] = await collectInternationalOnce({
    fetcher: endless.fetcher,
    now: FIXTURE_NOW,
    delayMs: 0,
    sources: ["idb"],
  });
  // Teto próprio de 10 páginas, abaixo do teto geral de 40: sem listagem completa, nada é encerrado.
  assert.equal(capped!.outcome, "partial");
  assert.equal(capped!.complete, false);
  assert.equal(capped!.requests, 12);
  assert.match(capped!.message!, /teto de 10 páginas/);
});

test("BID: erro 5xx é repetido com espera crescente; falha persistente não derruba as outras fontes", async () => {
  let calls = 0;
  const waits: number[] = [];
  const flaky = fixtureFetcher([
    [
      "https://data.iadb.org/api/3/action/datastore_search",
      () => {
        calls += 1;
        return calls === 1
          ? internationalResponse(502, "Bad Gateway")
          : internationalResponse(200, internationalFixture("idb-notices.json"));
      },
    ],
  ]);
  const [recovered] = await collectInternationalOnce({
    fetcher: flaky.fetcher,
    now: FIXTURE_NOW,
    delayMs: 0,
    wait: async (ms) => void waits.push(ms),
    sources: ["idb"],
  });
  assert.equal(recovered!.outcome, "ok");
  assert.equal(recovered!.count, 11);
  assert.deepEqual(waits, [5_000]);

  waits.length = 0;
  const down = fixtureFetcher([
    [
      "https://data.iadb.org/api/3/action/",
      () => internationalResponse(500, "Internal Server Error"),
    ],
  ]);
  const [worldbank, eu, broken] = await collectInternationalOnce({
    fetcher: down.fetcher,
    now: FIXTURE_NOW,
    delayMs: 0,
    wait: async (ms) => void waits.push(ms),
  });
  assert.equal(broken!.outcome, "failed");
  assert.match(broken!.message!, /data\.iadb\.org respondeu HTTP 500/);
  assert.equal(broken!.requests, 4);
  assert.deepEqual(waits, [5_000, 10_000]);
  assert.equal(worldbank!.outcome, "ok");
  assert.equal(eu!.outcome, "ok");

  // 404 não é transitório: falha na hora, sem nova tentativa.
  waits.length = 0;
  const missing = fixtureFetcher([
    [
      "https://data.iadb.org/api/3/action/package_show",
      () => internationalResponse(404, "Not Found"),
    ],
  ]);
  const [gone] = await collectInternationalOnce({
    fetcher: missing.fetcher,
    now: FIXTURE_NOW,
    delayMs: 0,
    wait: async (ms) => void waits.push(ms),
    sources: ["idb"],
  });
  assert.equal(gone!.outcome, "failed");
  assert.equal(gone!.requests, 2);
  assert.deepEqual(waits, []);
});

test("BID: o robots.txt publicado libera a API; um robots.txt que a proíba deixa a fonte de fora", async () => {
  const blocked = fixtureFetcher([
    [
      "https://data.iadb.org/robots.txt",
      () => internationalResponse(200, "User-agent: *\nDisallow: /api/\n"),
    ],
  ]);
  const [idbRead] = await collectInternationalOnce({
    fetcher: blocked.fetcher,
    now: FIXTURE_NOW,
    delayMs: 0,
    sources: ["idb"],
  });
  assert.equal(idbRead!.outcome, "blocked_by_robots");
  assert.deepEqual(
    blocked.requests.map((request) => request.url),
    ["https://data.iadb.org/robots.txt"],
  );
});
