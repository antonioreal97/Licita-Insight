import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { pages, parse, FAPERJ_PAGE } from "./fap-parsers-rj";
import { FAP_CATALOG, fapIdentity } from "./fap-sources";
import { collectFundingOnce } from "./funding-client";
const entry = FAP_CATALOG.find((e) => e.uf === "RJ")!;
const now = new Date("2026-11-06T15:00:00Z");
const fixture = () =>
  readFile(
    new URL("./fixtures/funding/fap/faperj-editais.html", import.meta.url),
    "utf8",
  );
test("FAPERJ: usa alias oficial da lista anual mesmo sem links na home", () => {
  assert.deepEqual(pages("", now), [FAPERJ_PAGE]);
});
test("FAPERJ: períodos da lista, prorrogação, título dividido e exclusão do conselho", async () => {
  const rows = parse(await fixture(), FAPERJ_PAGE, fapIdentity(entry), now);
  assert.equal(rows.length, 6);
  assert.match(rows.at(-1)!.title, /Inovação no Campo da Segurança Pública/);
  const first = rows[0]!;
  assert.equal(
    first.registrationFrom?.toISOString(),
    "2026-02-19T15:00:00.000Z",
  );
  assert.equal(first.registrationTo?.toISOString(), "2026-03-19T15:00:00.000Z");
  assert.equal(first.status, "closed");
  assert.equal(
    rows[1]!.registrationFrom?.toISOString(),
    "2026-05-04T15:00:00.000Z",
  );
  assert.equal(
    rows[1]!.registrationTo?.toISOString(),
    "2026-07-03T15:00:00.000Z",
  );
  const split = rows.find((r) => /30\/2026/.test(r.title))!;
  assert.match(split.title, /Biotérios/);
  assert.equal(split.registrationTo?.toISOString(), "2026-11-13T15:00:00.000Z");
  assert.equal(split.status, "open");
  assert.equal(split.documents.length, 1);
  for (const row of rows) {
    assert.equal(row.state, "RJ");
    assert.equal(row.installationId, "fap-rj");
    assert.match(row.sourceUrl, /#edital-\d+-2026$/);
    assert.deepEqual(Object.keys(row.raw).sort(), ["anchor", "sourceUrl"]);
    assert.ok(row.documents.length <= 5);
    assert.ok(
      row.documents.every(
        (doc) => !/resultado|extrato|&[a-z]+;/i.test(doc.url),
      ),
    );
  }
  assert.equal(
    parse(
      await fixture(),
      FAPERJ_PAGE,
      fapIdentity(entry),
      new Date("2027-11-06"),
    ).length,
    0,
  );
  // Em janeiro e fevereiro os editais do ano anterior continuam: o status sai das datas.
  const january = parse(await fixture(), FAPERJ_PAGE, fapIdentity(entry), new Date("2027-01-15T15:00:00Z"));
  assert.equal(january.length, rows.length);
  assert.ok(january.every((row) => row.status === "closed"));
  assert.equal(
    parse(await fixture(), FAPERJ_PAGE, fapIdentity(entry), new Date("2027-03-01T15:00:00Z")).length,
    0,
  );
});
test("FAPERJ: sem período, resultados e seleção de servidores não entram", () => {
  const html =
    '<a href="/premio.pdf">Edital FAPERJ Nº 40/2026 - Prêmio</a><br>Resultado: 01/12/2026<br><a href="/servidores.pdf">Edital FAPERJ Nº 41/2026 - Seleção de servidores</a><br>Inscrições: 01/11/2026 a 30/11/2026';
  assert.equal(parse(html, FAPERJ_PAGE, fapIdentity(entry), now).length, 0);
});
test("FAPERJ: coleta integrada com fixtures", async () => {
  const bodies = new Map([
    ["https://www.faperj.br/robots.txt", "User-agent: *\nDisallow: /busca"],
    [entry.home, ""],
    [FAPERJ_PAGE, await fixture()],
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
  const result = results.find((r) => r.installationId === "fap-rj")!;
  assert.equal(result.outcome, "ok");
  assert.equal(result.count, 6);
});

test("FAPERJ: fases, datas por extenso e corte antes da seção de cooperação", () => {
  const html =
    '<a href="/edital.pdf">Edital FAPERJ Nº 50/2026 - Fomento</a><br>Submissão de ideias: até 22/07/2026<br>Submissão dos projetos: 23/09/2026 a 22/10/2026<br><p><strong>2) OUTROS PROGRAMAS E CHAMADAS</strong></p>Submissão: 01/12/2026 a 20/12/2026';
  const row = parse(html, FAPERJ_PAGE, fapIdentity(entry), now)[0]!;
  assert.equal(row.registrationTo?.toISOString(), "2026-10-22T15:00:00.000Z");
  assert.equal(row.status, "closed");
  const short =
    html.split("<br>")[0] +
    "<br>Submissão de propostas: 03 a 30 de dezembro de 2026";
  const future = parse(short, FAPERJ_PAGE, fapIdentity(entry), now)[0]!;
  assert.equal(
    future.registrationFrom?.toISOString(),
    "2026-12-03T15:00:00.000Z",
  );
  assert.equal(future.status, "upcoming");
});
