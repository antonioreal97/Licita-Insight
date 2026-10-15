import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  applicationOnSourcePage,
  findApplicationLink,
  findRegistrationPeriod,
  noticeDocuments,
  readableTextFromHtml,
  urlsInText,
} from "./application-extract";
import { platformForUrl } from "./application-platforms";
import { federalFixture } from "./federal-fixtures";
import { linksFromHtml } from "./funding-parsers";
import { parseEuFacets, parseEuPage } from "./eu-ft-parsers";
import {
  FIXTURE_NOW,
  internationalFixtureJson,
} from "./international-fixtures";
import { TRANSFEREGOV_PORTAL } from "./transferegov-parsers";

const fixture = (name: string): string =>
  readFileSync(
    new URL(`./fixtures/application/${name}`, import.meta.url),
    "utf8",
  );

const PDSE_PAGE =
  "https://www.gov.br/capes/pt-br/acesso-a-informacao/acoes-e-programas/bolsas/bolsas-e-auxilios-internacionais/encontre-aqui/paises/multinacional/programa-de-doutorado-sanduiche-no-exterior-pdse";
const MINC_PAGE =
  "https://www.gov.br/cultura/pt-br/assuntos/editais/inscricoes-abertas/x";

const brasilia = (value: string) => new Date(`${value}-03:00`).toISOString();
const period = (text: string) => {
  const found = findRegistrationPeriod(text);
  return found
    ? {
        from: found.from?.toISOString() ?? null,
        to: found.to?.toISOString() ?? null,
      }
    : null;
};

test("CAPES APCN (Edital 20/2026): Plataforma Sucupira com o link do edital, mesmo quebrado entre linhas do PDF", () => {
  const text = fixture("capes-apcn-edital-20-2026.txt");
  assert.deepEqual(findApplicationLink(text), {
    url: "https://sucupira.capes.gov.br/apcn/submissao-de-proposta",
    platform: "sucupira",
    label: "Plataforma Sucupira",
  });
  // "de 24 de agosto de 2026 até as 18h do dia 18 de dezembro de 2026", repetido no cronograma.
  assert.deepEqual(period(text), {
    from: brasilia("2026-08-24T00:00:00"),
    to: brasilia("2026-12-18T18:00:00"),
  });
});

test("CAPES PDSE (Edital 22/2026): SICAPES; Linha Direta, SCBA e o link de autenticidade do SEI ficam de fora", () => {
  const text = fixture("capes-pdse-edital-22-2026.txt");
  assert.deepEqual(findApplicationLink(text), {
    url: "https://inscricao.capes.gov.br/",
    platform: "sicapes",
    label: "SICAPES",
  });
  // A homologação ("inscritos", 1º a 17/12) e a publicação das "inscrições homologadas" não são o período.
  assert.deepEqual(period(text), {
    from: brasilia("2026-10-01T00:00:00"),
    to: brasilia("2026-11-03T17:00:00"),
  });
});

test("CNPq 30/2026: Plataforma Carlos Chagas só nomeada leva à página de entrada; a Sucupira da verificação não conta", () => {
  const text = fixture("cnpq-chamada-30-2026.txt");
  assert.deepEqual(findApplicationLink(text), {
    url: "https://carloschagas.cnpq.br/",
    platform: "carlos-chagas",
    label: "Plataforma Carlos Chagas",
  });
  // "Data de início do período de submissão 20/08/2026" e "Data limite para submissão 11/12/2026".
  assert.deepEqual(period(text), {
    from: brasilia("2026-08-20T00:00:00"),
    to: brasilia("2026-12-11T23:59:59"),
  });
});

test("página do PDSE: o cronograma da página dá o período alterado; o link vem do edital, não da página", () => {
  const html = fixture("capes-pdse.html");
  const text = readableTextFromHtml(html, PDSE_PAGE);
  assert.equal(findApplicationLink(text, [PDSE_PAGE]), null);
  assert.deepEqual(period(text), {
    from: brasilia("2026-10-20T00:00:00"),
    to: brasilia("2026-11-18T17:00:00"),
  });
  // Lê o edital e as alterações do ano, nunca resultados, listas, anexos ou o edital de 2025.
  const documents = noticeDocuments([], linksFromHtml(html, PDSE_PAGE), 3);
  assert.equal(documents.length, 3);
  assert.match(documents[0]!.title, /^Edital nº 22\/2026/);
  assert.ok(
    documents
      .slice(1)
      .every((document) => /Alteração Edital nº 22\/2026/.test(document.title)),
  );
});

test("páginas do MinC e da Funarte: Salic pelo 'Link de Inscrição' e Prosas pela 'Página de inscrição'", () => {
  const rouanet = readableTextFromHtml(
    federalFixture("minc-rouanet-nas-favelas.html"),
    MINC_PAGE,
  );
  assert.deepEqual(findApplicationLink(rouanet, [MINC_PAGE]), {
    url: "https://salic.cultura.gov.br/autenticacao/index/index",
    platform: "salic",
    label: "Salic",
  });
  // Duas etapas com inscrição (Salic e site da Vale): datas diferentes não são um período.
  assert.equal(findRegistrationPeriod(rouanet), null);

  const funarte = readableTextFromHtml(
    federalFixture("funarte-chamada.html"),
    MINC_PAGE,
  );
  assert.equal(findApplicationLink(funarte)?.platform, "prosas");
  assert.deepEqual(period(funarte), {
    from: brasilia("2026-03-30T00:00:00"),
    to: brasilia("2027-04-30T17:59:00"),
  });

  // O link do Mapa da Cultura do Cultura Viva é de "acompanhamento e publicações", não de inscrição.
  const pontoes = readableTextFromHtml(
    federalFixture("minc-cultura-viva-pontoes.html"),
    MINC_PAGE,
  );
  assert.equal(findApplicationLink(pontoes, [MINC_PAGE]), null);
});

test("regras da fonte: Mapas Culturais, Transferegov e Funding & Tenders se inscrevem na própria página", () => {
  const mapas = "https://mapacultural.secult.ce.gov.br/oportunidade/7688/";
  assert.deepEqual(applicationOnSourcePage("mapas", mapas), {
    url: mapas,
    platform: "mapas-culturais",
    label: "Mapas Culturais",
  });
  assert.equal(
    applicationOnSourcePage("transferegov", TRANSFEREGOV_PORTAL)?.label,
    "Transferegov",
  );

  const europe = parseEuPage(
    internationalFixtureJson("eu-ft-search.json"),
    parseEuFacets(internationalFixtureJson("eu-ft-facet.json")),
    FIXTURE_NOW,
  ).drafts;
  const ruled = europe.map(
    (draft) =>
      applicationOnSourcePage(draft.source, draft.sourceUrl)?.platform ?? null,
  );
  const topics = europe.filter((draft) =>
    draft.sourceUrl.includes("/topic-details/"),
  ).length;
  assert.equal(
    ruled.filter((slug) => slug === "eu-funding-tenders").length,
    topics,
  );
  assert.equal(ruled.filter((slug) => slug === "eu-prospect").length, 1);
  // Financiamento em cascata: a inscrição é no site do projeto, que não é lido.
  assert.ok(
    europe.every(
      (draft, index) =>
        !draft.sourceUrl.includes("/competitive-calls-cs/") ||
        ruled[index] === null,
    ),
  );
  assert.equal(applicationOnSourcePage("capes", PDSE_PAGE), null);
  assert.equal(applicationOnSourcePage("worldbank", null), null);
});

test("um edital que manda se inscrever numa oportunidade do Mapa da Cultura aponta para ela", () => {
  const text =
    "7.1. As inscrições serão gratuitas e realizadas exclusivamente pelo Mapa da Cultura, no endereço\nhttps://mapa.cultura.gov.br/oportunidade/11685/, até o encerramento do prazo.";
  assert.deepEqual(findApplicationLink(text), {
    url: "https://mapa.cultura.gov.br/oportunidade/11685/",
    platform: "mapa-da-cultura",
    label: "Mapa da Cultura",
  });
  // A página inicial do Mapa da Cultura não é a página de uma chamada.
  assert.equal(platformForUrl("https://mapa.cultura.gov.br/"), null);
});

test("casos negativos: lei, e-mail, o próprio PDF, gov.br genérico e link sem palavra de lugar não viram inscrição", () => {
  const own =
    "https://www.gov.br/capes/pt-br/centrais-de-conteudo/editais/edital_2844920.pdf/@@display-file/file";
  const text = [
    "As inscrições obedecem à Lei nº 14.133, disponível em https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm.",
    "Para inscrição, dúvidas devem ser enviadas para inscricoes@exemplo.org.br ou mailto:inscricoes@exemplo.org.br.",
    `O edital de inscrição está em ${own}.`,
    "As inscrições estão descritas na página https://www.gov.br/cultura/pt-br/assuntos/editais.",
    "Inscrições: veja também https://www.exemplo.org.br/noticias/edital-aberto.",
  ].join("\n");
  assert.equal(findApplicationLink(text, [own]), null);
});

test("um link fora da tabela só vale logo depois de palavras de inscrição e de lugar, e se for o único", () => {
  const one =
    "As inscrições deverão ser feitas exclusivamente por meio do formulário disponível no link https://inscricoes.festival.org.br/2026.";
  assert.deepEqual(findApplicationLink(one), {
    url: "https://inscricoes.festival.org.br/2026",
    platform: null,
    label: null,
  });
  const two = `${one}\nTambém é possível se inscrever pelo site https://outro.festival.org.br/form.`;
  assert.equal(findApplicationLink(two), null);
  // Recurso, resultado e contato vêm depois das palavras de inscrição: outra etapa.
  assert.equal(
    findApplicationLink(
      "Após a inscrição, o recurso deve ser interposto pelo sistema disponível em https://recursos.festival.org.br.",
    ),
    null,
  );
});

test("duas plataformas indicadas com a mesma força: o edital não diz qual, nada é preenchido", () => {
  const text = [
    "As propostas deverão ser submetidas na Plataforma Sucupira.",
    "A inscrição do bolsista será feita pelo sistema SICAPES.",
  ].join("\n");
  assert.equal(findApplicationLink(text), null);
});

test("endereços quebrados no fim da linha do PDF são unidos só quando continuam um caminho", () => {
  const urls = urlsInText(
    [
      "disponível em: https://www.gov.br/capes/pt-",
      "br/acesso-a-informacao/avaliacao.",
      "pelo link https://sucupira.capes.gov.br/.",
      "4.14. A CAPES divulgará o resultado.",
      "no site https://exemplo.org.br/",
      "onde o candidato encontra o manual.",
    ].join("\n"),
  ).map(({ url }) => url);
  assert.deepEqual(urls, [
    "https://www.gov.br/capes/pt-br/acesso-a-informacao/avaliacao",
    "https://sucupira.capes.gov.br/",
    "https://exemplo.org.br/",
  ]);
});

test("datas: período inequívoco, prazo final só com 'até', e nada quando ambíguo ou sem ano", () => {
  assert.deepEqual(
    period("Inscrições de 10 de outubro a 30 de novembro de 2026."),
    {
      from: brasilia("2026-10-10T00:00:00"),
      to: brasilia("2026-11-30T23:59:59"),
    },
  );
  assert.deepEqual(
    period("As inscrições poderão ser feitas até 30/11/2026, às 18h."),
    {
      from: null,
      to: brasilia("2026-11-30T18:00:00"),
    },
  );
  assert.deepEqual(period("Período de inscrição: 01/12/2026 a 15/01/2027."), {
    from: brasilia("2026-12-01T00:00:00"),
    to: brasilia("2027-01-15T23:59:59"),
  });
  // Sem ano, não se sabe qual dezembro.
  assert.equal(
    period("A chamada recebe propostas até o dia 11 de dezembro."),
    null,
  );
  // Um edital e a sua retificação com prazos diferentes.
  assert.equal(
    period(
      "Inscrições de 1 a 30 de outubro de 2026. Retificação: inscrições de 1 de outubro a 15 de novembro de 2026.",
    ),
    null,
  );
  // Uma data sozinha precisa dizer se abre ou encerra.
  assert.equal(period("Inscrições: 30/11/2026."), null);
  assert.equal(
    period(
      "Publicação da relação das inscrições homologadas: a partir de 22 de dezembro de 2026.",
    ),
    null,
  );
  // 31 de fevereiro não existe.
  assert.equal(period("Inscrições de 1 a 31 de fevereiro de 2027."), null);
});
