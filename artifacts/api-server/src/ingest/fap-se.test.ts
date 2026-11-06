import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  fapitecPages,
  parseFapitecOpportunities,
  fapScSeDetail,
} from "./fap-parsers-sc-se-am";
import { FAP_CATALOG, fapIdentity } from "./fap-sources";
import { collectFundingOnce } from "./funding-client";
const fixture = (name: string) =>
  readFile(
    new URL(`./fixtures/funding/fap/fapitec-${name}`, import.meta.url),
    "utf8",
  );
const entry = FAP_CATALOG.find((row) => row.uf === "SE")!;
const identity = fapIdentity(entry);
const page = `${entry.home}editais-abertos/`;
const now = new Date("2026-11-06T12:00:00Z");

test("FAPITEC: descobre abertas, exclui credenciamento de consultoria e em andamento", async () => {
  assert.deepEqual(fapitecPages(await fixture("home.html")), [page]);
  assert.deepEqual(fapitecPages(""), []);
  const html = await fixture("abertos.html");
  const rows = parseFapitecOpportunities(html + html, page, identity, now);
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.title, /13\/2026.*BOLSAS DTI/);
  assert.equal(rows[0]!.state, "SE");
  assert.equal(rows[0]!.installationId, "fap-se");
  assert.equal(rows[0]!.status, "open");
  assert.equal(rows[0]!.registrationTo, null);
  assert.deepEqual(
    parseFapitecOpportunities(
      html,
      `${entry.home}editais-em-andamento/`,
      identity,
      now,
    ),
    [],
  );
});

test("FAPITEC: detalhe mantém abertura oficial sem inventar datas do cronograma em imagem", async () => {
  const row = parseFapitecOpportunities(
    await fixture("abertos.html"),
    page,
    identity,
    now,
  )[0]!;
  const result = fapScSeDetail(
    row,
    await fixture("detail-0.html"),
    identity,
    now,
  );
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0]!.title, "EDITAL");
  assert.equal(result.status, "open");
  assert.equal(result.registrationFrom, null);
  assert.equal(result.registrationTo, null);
  assert.deepEqual(result.raw, { sourceUrl: row.sourceUrl });
  const dated = fapScSeDetail(
    row,
    '<div class="entry-content">PERÍODO DE INSCRIÇÃO: 01/10/2026 a 30/10/2026<a href="/resultado.pdf">Resultado</a><a href="/extrato.pdf">Extrato do edital</a></div>',
    identity,
    now,
  );
  assert.equal(dated.registrationTo?.toISOString(), "2026-10-30T15:00:00.000Z");
  assert.equal(dated.status, "closed");
  assert.deepEqual(dated.documents, []);
});

test("FAPITEC: collectFundingOnce coleta apenas a bolsa aberta", async () => {
  const html = await fixture("abertos.html");
  const row = parseFapitecOpportunities(html, page, identity, now)[0]!;
  const bodies = new Map([
    [`${entry.home}robots.txt`, await fixture("robots.txt")],
    [entry.home, await fixture("home.html")],
    [page, html],
    [row.sourceUrl, await fixture("detail-0.html")],
  ]);
  const results = await collectFundingOnce({
    faps: [entry],
    now,
    delayMs: 0,
    fetchText: async (url) => {
      const body = bodies.get(url);
      if (body === undefined) throw new Error(`URL inesperada: ${url}`);
      return body;
    },
  });
  const result = results.find((r) => r.installationId === "fap-se")!;
  assert.equal(result.outcome, "ok");
  assert.equal(result.count, 1);
  assert.equal(result.drafts[0]!.status, "open");
});
