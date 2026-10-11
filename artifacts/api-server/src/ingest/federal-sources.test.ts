import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { cultureFederalSchedule } from "./culture-federal-schedule";
import {
  collectFederalOnce,
  FUNARTE_OPEN_URL,
  MINC_OPEN_URL,
} from "./federal-client";
import { federalDraft } from "./federal-draft";
import {
  FUNARTE_CALL_URL as FUNARTE_CALL,
  federalFixture,
  federalFixtureSources as sourcesFromFixtures,
  federalResponse as response,
  MINC_BIBLIOTECA_URL as MINC_BIBLIOTECA,
  MINC_PONTOES_URL as MINC_PONTOES,
  MINC_ROUANET_URL as MINC_ROUANET,
  PARCERIAS_PAGE_URL as PARCERIAS_PAGE,
  recordingFetcher as recorder,
} from "./federal-fixtures";
import { robotsAllows } from "./funding-client";
import {
  parseGovbrCallPage,
  parseGovbrCards,
  registrationWindowFromText,
} from "./govbr-parsers";
import {
  CsvRowReader,
  DiscricionariasPrograms,
  mapParceriasProgram,
  readCsvFromZip,
  type ParceriasProgram,
} from "./transferegov-parsers";

const fixture = async (name: string) => federalFixture(name);
const now = new Date("2026-10-11T12:00:00-03:00");
const day = (date: Date | null) =>
  date
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(date)
    : null;

const FUNARTE_BASE = "https://www.gov.br/funarte/pt-br/editais";

test("robots: curingas do gov.br bloqueiam só os formulários, não as páginas de editais", async () => {
  const robots = await fixture("govbr-robots.txt");
  assert.equal(robotsAllows(robots, FUNARTE_OPEN_URL), true);
  assert.equal(robotsAllows(robots, MINC_OPEN_URL), true);
  assert.equal(
    robotsAllows(robots, "https://www.gov.br/cultura/pt-br/sendto_form"),
    false,
  );
  assert.equal(
    robotsAllows(robots, "https://www.gov.br/economia/pt-br/internet/x"),
    false,
  );
  assert.equal(
    robotsAllows(await fixture("funarte-robots.txt"), FUNARTE_OPEN_URL),
    true,
  );
});

test("Funarte: a lista de editais abertos vira um cartão por chamada", async () => {
  const cards = parseGovbrCards(
    await fixture("funarte-editais-abertos.html"),
    FUNARTE_OPEN_URL,
  );
  assert.deepEqual(
    cards.map(({ title }) => title),
    [
      "Programa Funarte Aberta",
      "Convocatória - Mostra dos Estudantes da 16ª Quadrienal de Praga – PQ 2027",
      "Laç(z)os Artísticos – Chamada Especial CPLP",
      "2ª edição - Edital de Seleção Cultura Viva - Fomento à Rede de Pontões Cultura Viva",
    ],
  );
  assert.ok(cards.every(({ url }) => url.startsWith(`${FUNARTE_OPEN_URL}/`)));
});

test("Funarte: a página da chamada dá situação, prazo e anexos só com link e tipo", async () => {
  const page = parseGovbrCallPage(
    await fixture("funarte-chamada.html"),
    FUNARTE_CALL,
  );
  assert.equal(
    page.title,
    "Programa Funarte Aberta 2026 – Ocupação dos Espaços Culturais da Funarte - Centro de Teatro",
  );
  assert.equal(page.situation, "Inscrições abertas");
  assert.equal(page.registrationFrom, "2026-03-30");
  assert.equal(page.registrationTo, "2027-04-30");
  assert.deepEqual(page.cards, []);
  const regulation = page.documents.find(({ title }) =>
    title.startsWith("Regulamento"),
  );
  assert.equal(regulation?.mediaType, "application/pdf");
  assert.match(
    regulation?.url ?? "",
    /^https:\/\/www\.gov\.br\/funarte\/.+\.pdf$/,
  );
  assert.ok(
    page.documents.some(({ mediaType }) =>
      mediaType?.includes("wordprocessingml"),
    ),
  );
  assert.ok(
    page.documents.every((document) => Object.keys(document).length === 3),
  );
  assert.ok(page.summary && page.summary.length <= 400);
});

test("Funarte: página de programa lista as chamadas em cartões e não tem prazo próprio", async () => {
  const page = parseGovbrCallPage(
    await fixture("funarte-programa.html"),
    `${FUNARTE_BASE}/2026/programa-funarte-aberta`,
  );
  assert.equal(page.title, "Programa Funarte Aberta");
  assert.equal(page.cards.length, 6);
  assert.equal(page.registrationTo, null);
  assert.equal(page.situation, null);
});

test("MinC: cronograma, fluxo contínuo e chamada sem data na página", async () => {
  const rouanet = parseGovbrCallPage(
    await fixture("minc-rouanet-nas-favelas.html"),
    MINC_ROUANET,
  );
  assert.equal(rouanet.title, "Programa Rouanet nas Favelas 2");
  assert.equal(rouanet.registrationFrom, "2026-08-15");
  assert.equal(rouanet.registrationTo, "2026-10-13");
  assert.ok(
    rouanet.links.some(
      (link) => new URL(link).hostname === "salic.cultura.gov.br",
    ),
  );

  const library = parseGovbrCallPage(
    await fixture("minc-biblioteca-comunitaria.html"),
    MINC_BIBLIOTECA,
  );
  assert.equal(library.continuousFlow, true);
  assert.equal(library.registrationTo, null);
  assert.match(library.audience ?? "", /bibliotecas comunit[áa]rias/i);

  const pontoes = parseGovbrCallPage(
    await fixture("minc-cultura-viva-pontoes.html"),
    MINC_PONTOES,
  );
  assert.equal(pontoes.registrationFrom, null);
  assert.equal(pontoes.registrationTo, null);
  assert.ok(
    pontoes.links.includes("https://mapa.cultura.gov.br/oportunidade/11685"),
  );
  assert.ok(pontoes.documents.length >= 3);
});

test("prazo de inscrição: lê só a frase que fala de inscrição", () => {
  assert.deepEqual(
    registrationWindowFromText(
      "As inscrições ficam abertas de 01/09/2026 a 30/09/2026 pelo sistema.",
    ),
    { from: "2026-09-01", to: "2026-09-30", continuousFlow: false },
  );
  assert.deepEqual(
    registrationWindowFromText("Inscrições até o dia 05/11/2026."),
    { from: null, to: "2026-11-05", continuousFlow: false },
  );
  assert.deepEqual(
    registrationWindowFromText(
      "As inscrições estarão abertas até as 17h59min do dia 30 de abril de 2027 ou enquanto houver pauta.",
    ),
    { from: null, to: "2027-04-30", continuousFlow: false },
  );
  assert.deepEqual(
    registrationWindowFromText(
      "O resultado sai em 10/12/2026. A Funarte publica, dia 01 de outubro de 2026, a relação de propostas inscritas.",
    ),
    { from: null, to: null, continuousFlow: false },
  );
  assert.deepEqual(
    registrationWindowFromText("Inscrições de 31/02/2026 a 15/13/2026."),
    { from: null, to: null, continuousFlow: false },
  );
});

test("Transferegov parcerias: só programa disponibilizado com janela espontânea aberta", async () => {
  const body = JSON.parse(
    await fixture("transferegov-parcerias-programa.json"),
  ) as {
    data: ParceriasProgram[];
  };
  const drafts = body.data.flatMap(
    (record) => mapParceriasProgram(record, now) ?? [],
  );
  assert.deepEqual(
    drafts.map(({ id }) => id),
    ["transferegov-parcerias-181"],
  );
  const [pronas] = drafts;
  assert.equal(pronas!.kind, "funding");
  assert.equal(pronas!.organizationName, "Ministério da Saúde");
  assert.equal(pronas!.originName, null);
  assert.match(pronas!.searchText, /secretaria-executiva/);
  assert.equal(pronas!.audience, "Terceiro Setor");
  assert.equal(day(pronas!.registrationFrom), "2026-10-05");
  assert.equal(day(pronas!.registrationTo), "2026-10-26");
  assert.equal(pronas!.status, "open");
  assert.deepEqual(pronas!.areas, []);
  assert.match(
    pronas!.documents[0]!.url,
    /\/parcerias\/programa\?id_programa=181$/,
  );

  // Aberta até o fim do último dia, fora da listagem no dia seguinte.
  const lastEvening = new Date("2026-10-26T23:30:00-03:00");
  assert.equal(mapParceriasProgram(body.data[0]!, lastEvening)?.status, "open");
  const nextDay = new Date("2026-10-27T00:30:00-03:00");
  assert.equal(mapParceriasProgram(body.data[0]!, nextDay), null);
});

const programsFrom = async (at: Date) => {
  const programs = new DiscricionariasPrograms(at);
  const zip = zipSync({
    "siconv_programa.csv": strToU8(
      await fixture("siconv_programa-amostra.csv"),
    ),
  });
  await readCsvFromZip(zip, /siconv_programa\.csv$/i, programs.accept);
  return programs;
};

test("Transferegov CSV: uma chamada por programa, só as abertas, com área cultural e UF", async () => {
  const programs = await programsFrom(now);
  assert.equal(programs.rows, 21);
  const drafts = programs.drafts();
  const byId = new Map(drafts.map((draft) => [draft.externalId, draft]));
  assert.deepEqual([...byId.keys()].sort(), [
    "programa-2041120260009",
    "programa-2200020260004",
    "programa-2220120260014",
    "programa-3091320260004",
    "programa-4900020260025",
  ]);

  const culture = byId.get("programa-2041120260009")!;
  assert.equal(culture.organizationName, "Ministerio da Cultura");
  assert.equal(culture.kind, "partnership");
  assert.equal(culture.opportunityType, "Termo de colaboração");
  assert.deepEqual(culture.areas, ["audiovisual"]);
  assert.equal(culture.program, "audiovisual");
  assert.equal(culture.audience, "Organização da Sociedade Civil");
  assert.equal(day(culture.registrationFrom), "2026-09-30");
  assert.equal(day(culture.registrationTo), "2026-11-03");
  assert.equal(culture.amount, null);
  assert.match(culture.searchText, /2041120260009/);

  assert.equal(byId.get("programa-4900020260025")!.kind, "funding");
  assert.equal(byId.get("programa-2220120260014")!.state, "PR");
  const agro = byId.get("programa-2200020260004")!;
  assert.deepEqual(agro.areas, []);
  assert.match(agro.opportunityType ?? "", /Convênio/);

  // Encerra em 11/10: aberta no dia, fora no dia seguinte.
  assert.equal(byId.get("programa-3091320260004")!.status, "open");
  const tomorrow = await programsFrom(new Date("2026-10-12T08:00:00-03:00"));
  assert.ok(
    !tomorrow
      .drafts()
      .some(({ externalId }) => externalId === "programa-3091320260004"),
  );
});

test("CSV: campo entre aspas com separador e aspas dobradas, cortado em qualquer ponto", () => {
  const text = '﻿a;b;c\r\n1;"x; ""y""";3\r\n4;;6\r\n"7";8;"9\n9"';
  for (const size of [1, 2, 3, 5, text.length]) {
    const rows: string[][] = [];
    const reader = new CsvRowReader(";", (row) => rows.push(row));
    for (let index = 0; index < text.length; index += size)
      reader.push(text.slice(index, index + size));
    reader.end();
    assert.deepEqual(
      rows,
      [
        ["a", "b", "c"],
        ["1", 'x; "y"', "3"],
        ["4", "", "6"],
        ["7", "8", "9\n9"],
      ],
      `pedaços de ${size}`,
    );
  }
});

test("CSV sem as colunas esperadas falha com o nome das que faltam", () => {
  const programs = new DiscricionariasPrograms(now);
  assert.throws(
    () => programs.accept(["ID_PROGRAMA", "NOME_PROGRAMA"]),
    /sem as colunas esperadas: .*SIT_PROGRAMA/,
  );
});

test("situação: encerrada pela data; sem data vale o que a lista oficial declara", () => {
  const base = {
    source: "funarte" as const,
    externalId: "x",
    kind: "culture" as const,
    title: "Edital de teatro",
    organizationName: "Funarte",
    cultural: true,
    sourceUrl: "https://www.gov.br/funarte/pt-br/editais/x",
    raw: {},
    now,
  };
  assert.equal(
    federalDraft({
      ...base,
      registrationTo: new Date("2026-10-10T23:59:59-03:00"),
    }).status,
    "closed",
  );
  assert.equal(
    federalDraft({
      ...base,
      registrationFrom: new Date("2026-11-01T00:00:00-03:00"),
    }).status,
    "upcoming",
  );
  assert.equal(federalDraft({ ...base, listedAsOpen: true }).status, "open");
  assert.equal(federalDraft(base).status, "undated");
  assert.deepEqual(federalDraft(base).areas, ["teatro"]);
});

test("coleta mockada: quatro fontes, sem sair dos sites oficiais e sem repetir a chamada entre fontes", async () => {
  const { requested, fetcher } = recorder(await sourcesFromFixtures());
  const results = await collectFederalOnce({ now, delayMs: 0, fetcher });

  assert.deepEqual(
    results.map(({ source, outcome, count, open, complete }) => ({
      source,
      outcome,
      count,
      open,
      complete,
    })),
    [
      {
        source: "transferegov",
        outcome: "ok",
        count: 6,
        open: 6,
        complete: true,
      },
      { source: "minc", outcome: "ok", count: 2, open: 2, complete: true },
      { source: "salic", outcome: "ok", count: 1, open: 1, complete: true },
      { source: "funarte", outcome: "ok", count: 3, open: 3, complete: true },
    ],
  );

  // Só a API de dados abertos e o gov.br são requisitados: nem o Mapa da Cultura nem os sites de terceiros.
  assert.deepEqual(
    [...new Set(requested.map((url) => new URL(url).hostname))].sort(),
    ["api-publica.transferegov.gestao.gov.br", "www.gov.br"],
  );
  assert.equal(
    new Set(requested).size,
    requested.length - 1,
    "só o robots do gov.br se repete",
  );

  const [, minc, salic, funarte] = results;
  const rouanet = salic!.drafts[0]!;
  assert.equal(rouanet.title, "Programa Rouanet nas Favelas 2");
  assert.equal(rouanet.opportunityType, "Lei Rouanet");
  assert.equal(day(rouanet.registrationTo), "2026-10-13");
  assert.equal(rouanet.sourceUrl, MINC_ROUANET);

  assert.ok(
    minc!.drafts.every(
      ({ kind, status }) => kind === "culture" && status === "open",
    ),
  );
  const library = minc!.drafts.find(({ title }) =>
    title.includes("Biblioteca"),
  )!;
  assert.equal(library.continuousFlow, true);
  assert.equal(library.registrationTo, null);

  // O edital Cultura Viva está nas duas listas: fica o do MinC, que tem página e anexos.
  assert.match(
    funarte!.message ?? "",
    /1 chamada\(s\) já listada\(s\) por outra fonte/,
  );
  assert.ok(
    !funarte!.drafts.some(({ title }) => title.includes("Cultura Viva")),
  );
  const theatre = funarte!.drafts.find(({ title }) =>
    title.includes("Centro de Teatro"),
  )!;
  assert.equal(theatre.originName, "Programa Funarte Aberta");
  assert.equal(theatre.sourceUrl, FUNARTE_CALL);
  assert.deepEqual(theatre.areas, ["teatro"]);
  assert.equal(day(theatre.registrationTo), "2027-04-30");
  const external = funarte!.drafts.find(({ title }) =>
    title.includes("Quadrienal"),
  )!;
  assert.equal(
    external.sourceUrl,
    "https://cenografiasdoavesso.com/convocatoria/",
  );
  assert.equal(external.status, "open");
  assert.equal(external.registrationTo, null);

  const all = results.flatMap(({ drafts }) => drafts);
  assert.equal(new Set(all.map(({ id }) => id)).size, all.length);
});

test("coleta mockada: a mesma listagem lida duas vezes produz os mesmos ids", async () => {
  const sources = await sourcesFromFixtures();
  const ids = async () =>
    (
      await collectFederalOnce({
        now,
        delayMs: 0,
        fetcher: recorder(sources).fetcher,
      })
    )
      .flatMap(({ drafts }) => drafts.map(({ id }) => id))
      .sort();
  assert.deepEqual(await ids(), await ids());
});

test("coleta mockada: robots que proíbe a página encerra a fonte sem requisitar a página", async () => {
  const sources = await sourcesFromFixtures();
  sources.set(
    "https://www.gov.br/robots.txt",
    response(200, "User-agent: *\nDisallow: /"),
  );
  const { requested, fetcher } = recorder(sources);
  const results = await collectFederalOnce({ now, delayMs: 0, fetcher });
  assert.deepEqual(
    results.map(({ source, outcome, count }) => ({ source, outcome, count })),
    [
      { source: "transferegov", outcome: "ok", count: 6 },
      { source: "minc", outcome: "blocked_by_robots", count: 0 },
      { source: "salic", outcome: "blocked_by_robots", count: 0 },
      { source: "funarte", outcome: "blocked_by_robots", count: 0 },
    ],
  );
  assert.ok(!requested.includes(MINC_OPEN_URL));
  assert.ok(!requested.includes(FUNARTE_OPEN_URL));
  assert.ok(results.slice(1).every(({ complete }) => !complete));
});

test("coleta mockada: bloqueio 403 e falha da API viram falha registrada, sem nova tentativa", async () => {
  const sources = await sourcesFromFixtures();
  sources.set(MINC_OPEN_URL, response(403, "<html>Just a moment...</html>"));
  sources.set(PARCERIAS_PAGE, response(503));
  sources.set(
    FUNARTE_OPEN_URL,
    response(200, "<main><h1>Editais abertos</h1></main>"),
  );
  const { requested, fetcher } = recorder(sources);
  const results = await collectFederalOnce({ now, delayMs: 0, fetcher });
  const [transferegov, minc, salic, funarte] = results;

  // A API caiu, o CSV respondeu: fica o que veio e nada é dado como encerrado.
  assert.equal(transferegov!.outcome, "partial");
  assert.equal(transferegov!.complete, false);
  assert.equal(transferegov!.count, 5);
  assert.match(transferegov!.message ?? "", /Gestão de Parcerias: .*HTTP 503/);

  assert.equal(minc!.outcome, "failed");
  assert.match(minc!.message ?? "", /HTTP 403/);
  assert.equal(salic!.outcome, "failed");
  assert.equal(requested.filter((url) => url === MINC_OPEN_URL).length, 1);
  assert.equal(requested.filter((url) => url === PARCERIAS_PAGE).length, 1);

  // Lista vazia pode ser mudança de marcação: não autoriza encerrar o que estava aberto.
  assert.equal(funarte!.outcome, "partial");
  assert.equal(funarte!.complete, false);
  assert.equal(funarte!.count, 0);
});

test("flag: desligada por padrão, 09:00 quando ligada e nunca na janela noturna ou às 06:00", () => {
  assert.deepEqual(cultureFederalSchedule({}), { enabled: false });
  assert.deepEqual(
    cultureFederalSchedule({ CULTURE_FEDERAL_COLLECT: "false" }),
    {
      enabled: false,
    },
  );
  assert.deepEqual(cultureFederalSchedule({ CULTURE_FEDERAL_COLLECT: "1" }), {
    enabled: false,
  });
  assert.deepEqual(
    cultureFederalSchedule({ CULTURE_FEDERAL_COLLECT: "true" }),
    {
      enabled: true,
      hour: 9,
    },
  );
  assert.deepEqual(
    cultureFederalSchedule({
      CULTURE_FEDERAL_COLLECT: "true",
      CULTURE_FEDERAL_HOUR: "14",
    }),
    { enabled: true, hour: 14 },
  );
  for (const hour of ["0", "3", "5", "6", "24", "9.5", "nove"])
    assert.throws(
      () =>
        cultureFederalSchedule({
          CULTURE_FEDERAL_COLLECT: "true",
          CULTURE_FEDERAL_HOUR: hour,
        }),
      /CULTURE_FEDERAL_HOUR must be an integer from 7 to 23/,
      hour,
    );
  // Hora inválida não derruba quem deixou a coleta desligada.
  assert.deepEqual(cultureFederalSchedule({ CULTURE_FEDERAL_HOUR: "3" }), {
    enabled: false,
  });
});
