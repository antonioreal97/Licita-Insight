import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { collectFundingOnce } from "./funding-client";
import {
  fapAnchor,
  fapdfYearPages,
  parseFapdfOpportunities,
} from "./fap-parsers";
import { FAP_CATALOG, activeFaps, fapIdentity } from "./fap-sources";

const fixture = (name: string) =>
  readFile(
    fileURLToPath(new URL(`./fixtures/funding/fap/${name}`, import.meta.url)),
    "utf8",
  );
const fapdf = FAP_CATALOG.find((entry) => entry.uf === "DF")!;
const pageUrl = "https://www.fap.df.gov.br/editais-fapdf-20261";

test("catálogo tem uma FAP por UF, com as 27 unidades da federação", () => {
  const ufs = FAP_CATALOG.map((entry) => entry.uf);
  assert.equal(ufs.length, 27);
  assert.equal(new Set(ufs).size, 27);
  assert.ok(
    FAP_CATALOG.every(
      (entry) => entry.collection !== "active" || entry.adapter,
    ),
  );
  assert.equal(
    FAP_CATALOG.find((entry) => entry.uf === "MT")?.collection,
    "blocked_by_robots",
  );
});

test("FAP_SOURCES filtra por UF e desliga com off", () => {
  assert.deepEqual(
    activeFaps(undefined).map((entry) => entry.uf),
    ["DF", "GO", "MA", "MG", "PE", "RJ", "RS", "SC", "SE", "SP"],
  );
  assert.deepEqual(
    activeFaps("df").map((entry) => entry.uf),
    ["DF"],
  );
  assert.deepEqual(activeFaps("sp").map((entry) => entry.uf), ["SP"]);
  assert.deepEqual(activeFaps("off"), []);
});

test("FAPDF: acha a página do ano corrente e, em janeiro, também a do ano anterior", async () => {
  const home = await fixture("fapdf-home.html");
  assert.deepEqual(fapdfYearPages(home, new Date("2026-11-05T15:00:00Z")), [
    pageUrl,
  ]);
  assert.deepEqual(fapdfYearPages(home, new Date("2026-01-10T15:00:00Z")), [
    pageUrl,
    "https://www.fap.df.gov.br/editais-fapdf-2025",
  ]);
  // 2027 ainda sem página: lê a mais recente.
  assert.deepEqual(fapdfYearPages(home, new Date("2027-03-10T15:00:00Z")), [
    pageUrl,
  ]);
  assert.deepEqual(fapdfYearPages("<html></html>", new Date()), []);
});

test("âncora estável pelo número do edital", () => {
  assert.equal(
    fapAnchor("EDITAL 06/2026 - FAPDF DEMANDA ESPONTÂNEA"),
    "edital-06-2026",
  );
  assert.equal(
    fapAnchor("CHAMADA PÚBLICA FAPDF Nº 12/2026 SELEÇÃO DE BOLSISTAS"),
    "chamada-12-2026",
  );
  assert.equal(
    fapAnchor("EDITAL Nº 11/2026 - PROGRAMA FAPDF START BSB"),
    "edital-11-2026",
  );
  assert.equal(fapAnchor("Programa Especial"), "programa-especial");
});

test("FAPDF: cada edital com período de submissão vira uma chamada do DF", async () => {
  const now = new Date("2026-03-10T15:00:00Z");
  const rows = parseFapdfOpportunities(
    await fixture("fapdf-editais-2026.html"),
    pageUrl,
    fapIdentity(fapdf),
    now,
  );
  const anchors = rows.map((row) => row.sourceUrl.split("#")[1]);
  assert.equal(new Set(anchors).size, rows.length, "sem duplicatas");
  assert.ok(anchors.includes("edital-06-2026"));
  // As chamadas de um programa (Edital 07) entram uma a uma; o painel do programa, sem período, não.
  assert.ok(
    [
      "chamada-01-2026",
      "chamada-02-2026",
      "chamada-03-2026",
      "chamada-04-2026",
    ].every((a) => anchors.includes(a)),
  );
  assert.ok(!anchors.includes("edital-07-2026"));
  // Prêmio sem período e seleção de servidores ficam de fora.
  assert.ok(!anchors.includes("edital-04-2026"));
  assert.ok(!rows.some((row) => /SERVIDORES/i.test(row.title)));

  const demanda = rows.find((row) =>
    row.sourceUrl.endsWith("#edital-06-2026"),
  )!;
  assert.equal(demanda.source, "fap");
  assert.equal(demanda.installationId, "fap-df");
  assert.equal(demanda.state, "DF");
  assert.equal(demanda.organizationName, "FAPDF");
  assert.equal(demanda.kind, "funding");
  assert.equal(
    demanda.registrationFrom?.toISOString(),
    "2026-03-03T15:00:00.000Z",
  );
  assert.equal(
    demanda.registrationTo?.toISOString(),
    "2026-04-24T15:00:00.000Z",
  );
  assert.equal(demanda.status, "open");
  assert.ok(demanda.documents.length > 0);
  assert.ok(
    demanda.documents.every((doc) => !/extrato|resultado/i.test(doc.title)),
  );
  assert.deepEqual(Object.keys(demanda.raw).sort(), ["anchor", "sourceUrl"]);

  const publica = rows.find((row) =>
    row.sourceUrl.endsWith("#edital-01-2026"),
  )!;
  assert.equal(publica.status, "closed");
});

test("coleta FAP: respeita robots, lê a home e a página do ano e reporta por instalação", async () => {
  const bodies = new Map([
    ["https://www.fap.df.gov.br/robots.txt", await fixture("fapdf-robots.txt")],
    ["https://www.fap.df.gov.br/", await fixture("fapdf-home.html")],
    [pageUrl, await fixture("fapdf-editais-2026.html")],
  ]);
  const results = await collectFundingOnce({
    now: new Date("2026-11-05T15:00:00Z"),
    delayMs: 0,
    faps: [fapdf],
    fetchText: async (url) => {
      // CAPES, CNPq e FINEP não interessam aqui: falham sem derrubar a FAP.
      const body = bodies.get(url);
      if (body === undefined) throw new Error(`URL inesperada: ${url}`);
      return body;
    },
  });
  const fap = results.find((result) => result.source === "fap")!;
  assert.equal(fap.installationId, "fap-df");
  assert.equal(fap.outcome, "ok");
  assert.ok(
    fap.count >= 10,
    `esperava ao menos 10 chamadas, veio ${fap.count}`,
  );
  assert.ok(
    fap.drafts.every(
      (row) => row.state === "DF" && row.installationId === "fap-df",
    ),
  );
});

test("coleta FAP: robots.txt que proíbe tudo não lê a home", async () => {
  const requested: string[] = [];
  const results = await collectFundingOnce({
    now: new Date("2026-11-05T15:00:00Z"),
    delayMs: 0,
    faps: [fapdf],
    fetchText: async (url) => {
      requested.push(url);
      if (url === "https://www.fap.df.gov.br/robots.txt")
        return "User-agent: *\nDisallow: /\n";
      throw new Error(`URL inesperada: ${url}`);
    },
  });
  const fap = results.find((result) => result.source === "fap")!;
  assert.equal(fap.outcome, "blocked_by_robots");
  assert.ok(!requested.includes("https://www.fap.df.gov.br/"));
});

test("detail: lê a página de cada chamada, completa o período e descarta o que não é chamada", async () => {
  const { collectFapDrafts } = await import("./fap-sources");
  const { draft } = await import("./funding-parsers");
  const { submissionPeriod } = await import("./fap-parsers");
  const now = new Date("2026-11-05T15:00:00Z");
  const listed = (path: string) =>
    draft({
      source: "fap",
      installationId: "fap-xx",
      state: "XX",
      kind: "funding",
      title: `Chamada ${path}`,
      organizationName: "FAPXX",
      sourceUrl: `https://fap.example.org/${path}`,
      now,
    });
  const requested: string[] = [];
  const bodies = new Map([
    ["https://fap.example.org/", "<html></html>"],
    ["https://fap.example.org/editais", "lista"],
    [
      "https://fap.example.org/a",
      "PERÍODO DE INSCRIÇÃO: 01/11/2026 a 30/11/2026",
    ],
    ["https://fap.example.org/b", "Resultado final"],
  ]);
  const { drafts } = await collectFapDrafts(
    {
      uf: "XX",
      acronym: "FAPXX",
      name: "FAP de teste",
      home: "https://fap.example.org/",
      collection: "active",
      adapter: {
        pages: () => ["https://fap.example.org/editais"],
        parse: () => [listed("a"), listed("b"), listed("c")],
        detail: (item, html) => {
          const period = submissionPeriod(html);
          return period
            ? {
                ...item,
                registrationFrom: period.from,
                registrationTo: period.to,
                status: "open",
              }
            : null;
        },
      },
    },
    {
      now,
      wait: async () => {},
      fetchText: async (url) => {
        requested.push(url);
        const body = bodies.get(url);
        if (body === undefined) throw new Error(`404 ${url}`);
        return body;
      },
    },
  );
  // a: completed; b: dropped by detail; c: page failed, kept as listed.
  assert.deepEqual(
    drafts.map((item) => item.sourceUrl.split("/").pop()),
    ["a", "c"],
  );
  assert.equal(
    drafts[0]!.registrationTo?.toISOString(),
    "2026-11-30T15:00:00.000Z",
  );
  assert.ok(requested.includes("https://fap.example.org/c"));
});

test("FAP_MAX_DETAILS aceita só inteiro positivo e cai para 30", async () => {
  const { fapMaxDetails } = await import("./fap-sources");
  assert.equal(fapMaxDetails("5"), 5);
  assert.equal(fapMaxDetails(undefined), 30);
  assert.equal(fapMaxDetails("0"), 30);
  assert.equal(fapMaxDetails("abc"), 30);
});
