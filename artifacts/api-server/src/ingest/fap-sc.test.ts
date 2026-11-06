import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  fapescPages,
  parseFapescOpportunities,
  fapScSeDetail,
} from "./fap-parsers-sc-se-am";
import { FAP_CATALOG, fapIdentity } from "./fap-sources";
import { collectFundingOnce } from "./funding-client";
const fixture = (name: string) =>
  readFile(
    new URL(`./fixtures/funding/fap/fapesc-${name}`, import.meta.url),
    "utf8",
  );
const entry = FAP_CATALOG.find((row) => row.uf === "SC")!;
const identity = fapIdentity(entry);
const page = `${entry.home}chamadas-abertas/`;
const now = new Date("2026-11-06T12:00:00Z");

test("FAPESC: descobre só abertas e lista cinco chamadas oficiais sem duplicatas", async () => {
  assert.deepEqual(fapescPages(await fixture("home.html")), [page]);
  assert.deepEqual(fapescPages(""), []);
  const html = await fixture("abertos.html");
  const rows = parseFapescOpportunities(html + html, page, identity, now);
  assert.equal(rows.length, 5);
  assert.match(rows[0]!.title, /55\/2026.*PROFIX-CB/);
  for (const row of rows) {
    assert.equal(row.installationId, "fap-sc");
    assert.equal(row.state, "SC");
    assert.equal(row.status, "open");
    assert.equal(row.source, "fap");
    assert.deepEqual(row.raw, { sourceUrl: row.sourceUrl });
  }
  const excluded = [
    "RESULTADO Edital 01/2026",
    "RETIFICAÇÃO Edital 02/2026",
    "Edital seleção de servidores",
    "Edital estagiários",
    "Edital Prêmio sem prazo",
    "Notícia de chamada",
  ];
  assert.deepEqual(
    parseFapescOpportunities(
      excluded
        .map((t, i) => `<h3 class="upk-title"><a href="/${i}">${t}</a></h3>`)
        .join(""),
      page,
      identity,
      now,
    ),
    [],
  );
  assert.deepEqual(
    parseFapescOpportunities(
      html,
      `${entry.home}chamadas-em-andamento/`,
      identity,
      now,
    ),
    [],
  );
});

test("FAPESC: detalhe extrai prazo, fluxo contínuo e somente edital/retificações", async () => {
  const rows = parseFapescOpportunities(
    await fixture("abertos.html"),
    page,
    identity,
    now,
  );
  const result = fapScSeDetail(
    rows[0]!,
    await fixture("detail-0.html"),
    identity,
    now,
  );
  assert.equal(
    result.registrationFrom?.toISOString(),
    "2026-09-23T15:00:00.000Z",
  );
  assert.equal(
    result.registrationTo?.toISOString(),
    "2026-11-06T15:00:00.000Z",
  );
  assert.equal(result.status, "open");
  assert.equal(result.documents.length, 2);
  assert.equal(result.sourceUrl, rows[0]!.sourceUrl);
  assert.deepEqual(result.raw, { sourceUrl: result.sourceUrl });
  assert.equal(
    fapScSeDetail(rows[1]!, await fixture("detail-1.html"), identity, now)
      .status,
    "closed",
  );
  const flow = fapScSeDetail(
    rows[2]!,
    await fixture("detail-2.html"),
    identity,
    now,
  );
  assert.equal(flow.registrationTo?.toISOString(), "2028-06-30T15:00:00.000Z");
  assert.equal(flow.status, "open");
  assert.equal(flow.documents.length, 1);
  const noEnd = fapScSeDetail(
    rows[4]!,
    await fixture("detail-4.html"),
    identity,
    now,
  );
  assert.equal(noEnd.registrationTo, null);
  assert.equal(noEnd.status, "open");
  assert.ok(noEnd.documents.every((doc) => !/resultado/i.test(doc.title)));
  assert.equal(
    fapScSeDetail(
      rows[0]!,
      "<footer>Prazo para submissão: 01/01/2020 a 02/01/2020</footer>",
      identity,
      now,
    ),
    rows[0],
  );
  const docs = Array.from(
    { length: 7 },
    (_, i) => `<a href="/edital-${i}.pdf">Retificação ${i}</a>`,
  ).join("");
  assert.equal(
    fapScSeDetail(
      rows[0]!,
      `<div class="elementor-widget-theme-post-content">${docs}${docs}<a href="/resultado.pdf">Edital resultado</a></div>`,
      identity,
      now,
    ).documents.length,
    5,
  );
});

test("FAPESC: collectFundingOnce lê listagem e os cinco detalhes sem gravar", async () => {
  const html = await fixture("abertos.html");
  const rows = parseFapescOpportunities(html, page, identity, now);
  const bodies = new Map([
    [`${entry.home}robots.txt`, await fixture("robots.txt")],
    [entry.home, await fixture("home.html")],
    [page, html],
  ]);
  for (const [i, row] of rows.entries())
    bodies.set(row.sourceUrl, await fixture(`detail-${i}.html`));
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
  const result = results.find((r) => r.installationId === "fap-sc")!;
  assert.equal(result.outcome, "ok");
  assert.equal(result.count, 5);
  assert.equal(result.drafts.filter((r) => r.status === "open").length, 4);
});
