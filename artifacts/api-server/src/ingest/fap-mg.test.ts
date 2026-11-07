import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { collectFundingOnce } from "./funding-client";
import {
  FAPEMIG_OPEN_PAGE,
  fapemigPages,
  parseFapemigOpportunities,
} from "./fap-parsers-mg";
import { FAP_CATALOG, fapIdentity } from "./fap-sources";

const fixture = (name: string) =>
  readFile(
    fileURLToPath(new URL(`./fixtures/funding/fap/${name}`, import.meta.url)),
    "utf8",
  );

const fapemig = FAP_CATALOG.find((entry) => entry.uf === "MG")!;

test("FAPEMIG: acha a listagem de chamadas e usa o filtro aberta", async () => {
  assert.deepEqual(fapemigPages(await fixture("fapemig-home.html")), [
    FAPEMIG_OPEN_PAGE,
  ]);
  assert.deepEqual(fapemigPages("<html></html>"), []);
});

test("FAPEMIG: payload Nuxt vira chamadas abertas do MG com período e documentos", async () => {
  const now = new Date("2026-11-05T15:00:00Z");
  const rows = parseFapemigOpportunities(
    await fixture("fapemig-abertas.html"),
    FAPEMIG_OPEN_PAGE,
    fapIdentity(fapemig),
    now,
  );
  assert.equal(rows.length, 2);
  assert.ok(
    rows.every(
      (row) =>
        row.source === "fap" &&
        row.installationId === "fap-mg" &&
        row.state === "MG" &&
        row.organizationName === "FAPEMIG",
    ),
  );
  assert.ok(
    !rows.some((row) => /encerrada de teste/i.test(row.title)),
  );
  const oet = rows.find((row) => /007\/2026/i.test(row.title))!;
  assert.match(
    oet.sourceUrl,
    /\/oportunidades\/chamadas-e-editais\/007-2026-organizacao-de-eventos/,
  );
  assert.equal(oet.registrationFrom?.toISOString().slice(0, 10), "2026-10-28");
  assert.equal(oet.registrationTo?.toISOString().slice(0, 10), "2027-01-26");
  assert.equal(oet.status, "open");
  assert.ok(oet.documents.length >= 1);
  assert.ok(oet.documents.length <= 5);
  assert.ok(
    oet.documents.every(
      (doc) =>
        /edital|chamada|retifica/i.test(doc.title) &&
        !/anexo i|termo de|decis/i.test(doc.title),
    ),
  );
  assert.deepEqual(Object.keys(oet.raw).sort(), ["sourceUrl"]);
  assert.equal(
    parseFapemigOpportunities(
      await fixture("fapemig-abertas.html"),
      "https://fapemig.br/oportunidades/chamadas-e-editais",
      fapIdentity(fapemig),
      now,
    ).length,
    0,
  );
});

test("coleta FAPEMIG: home e listagem Nuxt com fixtures", async () => {
  const bodies = new Map([
    ["https://fapemig.br/robots.txt", await fixture("fapemig-robots.txt")],
    ["https://fapemig.br/", await fixture("fapemig-home.html")],
    [FAPEMIG_OPEN_PAGE, await fixture("fapemig-abertas.html")],
  ]);
  const results = await collectFundingOnce({
    now: new Date("2026-11-05T15:00:00Z"),
    delayMs: 0,
    faps: [fapemig],
    fetchText: async (url) => {
      const body = bodies.get(url);
      if (body === undefined) throw new Error(`URL inesperada: ${url}`);
      return body;
    },
  });
  const fap = results.find((result) => result.installationId === "fap-mg")!;
  assert.equal(fap.outcome, "ok");
  assert.equal(fap.count, 2);
  assert.equal(fap.drafts[0]!.state, "MG");
});
