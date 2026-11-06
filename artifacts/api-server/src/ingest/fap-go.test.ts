import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { collectFundingOnce } from "./funding-client";
import {
  FAPEG_OPEN_PAGE,
  fapegDetail,
  fapegPages,
  parseFapegOpportunities,
} from "./fap-parsers-go";
import { FAP_CATALOG, fapIdentity } from "./fap-sources";

const fixture = (name: string) =>
  readFile(
    fileURLToPath(new URL(`./fixtures/funding/fap/${name}`, import.meta.url)),
    "utf8",
  );

const fapeg = FAP_CATALOG.find((entry) => entry.uf === "GO")!;
const detailUrl =
  "https://goias.gov.br/fapeg/chamada-publica-fapeg-no-17-2026-edital-complementar-a-chamada-confap-wbi-wallonie-bruxelles-international/";

test("FAPEG: acha Inscrições Abertas (não Em Andamento)", async () => {
  assert.deepEqual(fapegPages(await fixture("fapeg-home.html")), [
    FAPEG_OPEN_PAGE,
  ]);
  assert.deepEqual(fapegPages("<html></html>"), []);
});

test("FAPEG: cada linha da tabela vira chamada aberta do GO", async () => {
  const now = new Date("2026-11-05T15:00:00Z");
  const rows = parseFapegOpportunities(
    await fixture("fapeg-inscricoes-abertas.html"),
    FAPEG_OPEN_PAGE,
    fapIdentity(fapeg),
    now,
  );
  assert.equal(rows.length, 1);
  const call = rows[0]!;
  assert.equal(call.source, "fap");
  assert.equal(call.installationId, "fap-go");
  assert.equal(call.state, "GO");
  assert.equal(call.organizationName, "FAPEG");
  assert.equal(call.status, "open");
  assert.equal(call.sourceUrl, detailUrl);
  assert.match(call.title, /17\/2026/);
  assert.match(call.title, /CONFAP-WBI/i);
  assert.deepEqual(Object.keys(call.raw).sort(), ["sourceUrl"]);
  assert.equal(
    parseFapegOpportunities(
      await fixture("fapeg-inscricoes-abertas.html"),
      "https://goias.gov.br/fapeg/editais/em-andamento/",
      fapIdentity(fapeg),
      now,
    ).length,
    0,
  );
});

test("FAPEG: detail traz edital e retificação, sem resultados", async () => {
  const now = new Date("2026-11-05T15:00:00Z");
  const listed = parseFapegOpportunities(
    await fixture("fapeg-inscricoes-abertas.html"),
    FAPEG_OPEN_PAGE,
    fapIdentity(fapeg),
    now,
  )[0]!;
  const completed = fapegDetail(
    listed,
    await fixture("fapeg-detail.html"),
    fapIdentity(fapeg),
    now,
  )!;
  assert.equal(completed.sourceUrl, listed.sourceUrl);
  assert.equal(completed.status, "open");
  assert.ok(completed.documents.length >= 1);
  assert.ok(
    completed.documents.every(
      (doc) =>
        /edital|retifica/i.test(doc.title) &&
        !/resultado|homologa/i.test(doc.title),
    ),
  );
  assert.ok(completed.documents.length <= 5);
});

test("coleta FAPEG: home, listagem e detail com fixtures", async () => {
  const bodies = new Map([
    ["https://goias.gov.br/robots.txt", await fixture("fapeg-robots.txt")],
    ["https://goias.gov.br/fapeg/", await fixture("fapeg-home.html")],
    [FAPEG_OPEN_PAGE, await fixture("fapeg-inscricoes-abertas.html")],
    [detailUrl, await fixture("fapeg-detail.html")],
  ]);
  const results = await collectFundingOnce({
    now: new Date("2026-11-05T15:00:00Z"),
    delayMs: 0,
    faps: [fapeg],
    fetchText: async (url) => {
      const body = bodies.get(url);
      if (body === undefined) throw new Error(`URL inesperada: ${url}`);
      return body;
    },
  });
  const fap = results.find((result) => result.installationId === "fap-go")!;
  assert.equal(fap.outcome, "ok");
  assert.equal(fap.count, 1);
  assert.equal(fap.drafts[0]!.state, "GO");
  assert.ok(fap.drafts[0]!.documents.length >= 1);
});
