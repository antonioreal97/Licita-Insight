import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { pages, parse, FAPESP_PAGE } from "./fap-parsers-sp";
import { FAP_CATALOG, fapIdentity } from "./fap-sources";
import { collectFundingOnce } from "./funding-client";
const entry = FAP_CATALOG.find((e) => e.uf === "SP")!;
const now = new Date("2026-11-06T15:00:00Z");
const fixture = () =>
  readFile(
    new URL("./fixtures/funding/fap/fapesp-chamadas.html", import.meta.url),
    "utf8",
  );
test("FAPESP: endereço estável independe do alias anual do menu", () => {
  assert.deepEqual(pages("", now), [FAPESP_PAGE]);
});
test("FAPESP: prazo, parceria, prazo impreciso e fluxo contínuo no painel aberto", async () => {
  const rows = parse(await fixture(), FAPESP_PAGE, fapIdentity(entry), now);
  assert.equal(rows.length, 3);
  assert.match(rows[0]!.title, /Biodiversa/);
  assert.equal(
    rows[0]!.registrationTo?.toISOString(),
    "2026-11-10T15:00:00.000Z",
  );
  assert.equal(rows[0]!.registrationFrom, null);
  for (const row of rows) {
    assert.equal(row.state, "SP");
    assert.equal(row.installationId, "fap-sp");
    assert.equal(row.status, "open");
    assert.deepEqual(Object.keys(row.raw), ["sourceUrl"]);
    assert.equal(row.documents.length, 0);
  }
  assert.equal(rows[1]!.registrationTo, null);
  assert.equal(rows[2]!.sourceUrl, "https://fapesp.br/11999");
  assert.equal(
    parse(
      '<h3><a href="/11999">FAPPA</a></h3>Prazo: fluxo contínuo',
      FAPESP_PAGE,
      fapIdentity(entry),
      now,
    ).length,
    0,
  );
  assert.equal(
    parse(
      await fixture(),
      FAPESP_PAGE,
      fapIdentity(entry),
      new Date("2027-01-01"),
    )[0]!.status,
    "closed",
  );
});
test("FAPESP: deduplica e limita documentos, sem resultados ou extratos", () => {
  const block =
    '<h3><a href="/123">Chamada de pesquisa</a></h3>Prazo: 10/11/2026<br>' +
    Array.from(
      { length: 7 },
      (_, i) => `<a href="/edital-${i}.pdf">Edital ${i}</a>`,
    ).join("") +
    '<a href="/resultado.pdf">Resultado do edital</a><a href="/extrato.pdf">Extrato do edital</a>';
  const rows = parse(
    `Abertas (Todas)${block}${block}`,
    FAPESP_PAGE,
    fapIdentity(entry),
    now,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.documents.length, 5);
  assert.ok(
    rows[0]!.documents.every((doc) => !/resultado|extrato/.test(doc.url)),
  );
});
test("FAPESP: coleta integrada com fixtures", async () => {
  const bodies = new Map([
    ["https://fapesp.br/robots.txt", "User-agent: *\nDisallow:"],
    [entry.home, ""],
    [FAPESP_PAGE, await fixture()],
  ]);
  const results = await collectFundingOnce({
    faps: [entry],
    delayMs: 0,
    now,
    fetchText: async (url) => {
      const body = bodies.get(url);
      if (body === undefined) throw new Error(url);
      return body;
    },
  });
  const result = results.find((r) => r.installationId === "fap-sp")!;
  assert.equal(result.outcome, "ok");
  assert.equal(result.count, 3);
});
