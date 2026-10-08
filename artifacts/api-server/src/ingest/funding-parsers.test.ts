import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  parseCapesOpportunities,
  parseCnpqOpportunities,
  enrichFinepOpportunity,
  parseFinepOpportunities,
} from "./funding-parsers";
import { collectFundingOnce, robotsAllows } from "./funding-client";

const fixture = (name: string) =>
  readFile(
    fileURLToPath(new URL(`./fixtures/funding/${name}.html`, import.meta.url)),
    "utf8",
  );
const now = new Date("2026-10-08T15:00:00Z");

test("parser FINEP deduplica a chamada por URL", async () => {
  const rows = parseFinepOpportunities(await fixture("finep"), now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.source, "finep");
  assert.equal(rows[0]!.kind, "innovation");
  assert.match(rows[0]!.sourceUrl, /chamadapublica\/763$/);
  const enriched = enrichFinepOpportunity(
    rows[0]!,
    await fixture("finep-detail"),
    now,
  );
  assert.equal(enriched.amount, 12_500_000);
  assert.equal(
    enriched.registrationTo?.toISOString(),
    "2026-11-30T15:00:00.000Z",
  );
  assert.equal(enriched.documents[0]?.mediaType, "application/pdf");
});

test("parser CNPq extrai prazo, resumo e PDF", async () => {
  const rows = parseCnpqOpportunities(await fixture("cnpq"), now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.status, "open");
  assert.equal(
    rows[0]!.registrationFrom?.toISOString(),
    "2026-08-19T15:00:00.000Z",
  );
  assert.equal(
    rows[0]!.registrationTo?.toISOString(),
    "2026-12-11T15:00:00.000Z",
  );
  assert.equal(rows[0]!.documents[0]?.mediaType, "application/pdf");
});

test("parser CAPES limita a lista à seção de editais abertos", async () => {
  const rows = parseCapesOpportunities(await fixture("capes"), now);
  assert.deepEqual(
    rows.map(({ title }) => title),
    ["Programa Cátedra", "Programa CAPES/Cofecub"],
  );
  assert.ok(rows.every(({ status }) => status === "open"));
});

test("robots aplica a regra mais específica e bloqueia Disallow raiz", () => {
  assert.equal(
    robotsAllows("User-agent: *\nDisallow: /", "https://example.com/lista"),
    false,
  );
  assert.equal(
    robotsAllows(
      "User-agent: *\nDisallow: /privado\nAllow: /privado/publico",
      "https://example.com/privado/publico",
    ),
    true,
  );
});

test("coleta mockada respeita robots e agrega as três fontes", async () => {
  const bodies = new Map<string, string>([
    ["https://www.finep.gov.br/robots.txt", "User-agent: *\nDisallow: /"],
    ["https://www.gov.br/cnpq/robots.txt", "User-agent: *\nDisallow:"],
    ["https://www.gov.br/capes/robots.txt", "User-agent: *\nDisallow: /login"],
    [
      "https://www.gov.br/cnpq/pt-br/chamadas/abertas-para-submissao",
      await fixture("cnpq"),
    ],
    [
      "https://www.gov.br/capes/pt-br/assuntos/editais-e-resultados-capes",
      await fixture("capes"),
    ],
  ]);
  const requested: string[] = [];
  const results = await collectFundingOnce({
    now,
    delayMs: 0,
    fetchText: async (url) => {
      requested.push(url);
      const body = bodies.get(url);
      if (body === undefined) throw new Error(`URL inesperada: ${url}`);
      return body;
    },
  });
  assert.deepEqual(
    results.map(({ source, outcome, count }) => ({ source, outcome, count })),
    [
      { source: "finep", outcome: "blocked_by_robots", count: 0 },
      { source: "cnpq", outcome: "ok", count: 1 },
      { source: "capes", outcome: "ok", count: 2 },
    ],
  );
  assert.ok(
    !requested.includes(
      "https://www.finep.gov.br/chamadas-publicas/chamadapublica/1",
    ),
  );
});
