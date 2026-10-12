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
import { euEligibility, worldBankEligibility } from "./international-eligibility";
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
    ],
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
  assert.deepEqual(internationalSourcesFromEnv({}), ["worldbank", "eu_ft"]);
  assert.deepEqual(
    internationalSourcesFromEnv({ INTERNATIONAL_SOURCES: "eu_ft" }),
    ["eu_ft"],
  );
  assert.throws(
    () => internationalSourcesFromEnv({ INTERNATIONAL_SOURCES: "worldbank,ungm" }),
    /received "ungm"/,
  );
});
