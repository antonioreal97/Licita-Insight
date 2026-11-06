import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { collectFundingOnce } from "./funding-client";
import {
  FAPEMA_OPEN_PAGE,
  fapemaDetail,
  fapemaPages,
  fapemaPeriod,
  parseFapemaOpportunities,
} from "./fap-parsers-ma";
import { FAP_CATALOG, fapIdentity } from "./fap-sources";

const fixture = (name: string) =>
  readFile(
    fileURLToPath(new URL(`./fixtures/funding/fap/${name}`, import.meta.url)),
    "utf8",
  );

const fapema = FAP_CATALOG.find((entry) => entry.uf === "MA")!;
const detailUrl = "https://www.fapema.br/edital-fapema-n-22-2026/";

test("FAPEMA: acha a categoria de editais em aberto", async () => {
  assert.deepEqual(fapemaPages(await fixture("fapema-home.html")), [
    FAPEMA_OPEN_PAGE,
  ]);
  assert.deepEqual(fapemaPages("<html></html>"), []);
});

test("FAPEMA: período livre no texto do post", () => {
  const period = fapemaPeriod(
    "Período de submissão on-line (até às 12h) 31/08/2026 a 14/09/2026",
  );
  assert.equal(period?.from?.toISOString(), "2026-08-31T15:00:00.000Z");
  assert.equal(period?.to?.toISOString(), "2026-09-14T15:00:00.000Z");
  assert.equal(
    fapemaPeriod("Inscrições até às 12h de 15/06/2026")?.to?.toISOString(),
    "2026-06-15T15:00:00.000Z",
  );
});

test("FAPEMA: listagem traz posts de edital e deixa resultados de fora", async () => {
  const now = new Date("2026-09-01T15:00:00Z");
  const rows = parseFapemaOpportunities(
    await fixture("fapema-editais-em-aberto.html"),
    FAPEMA_OPEN_PAGE,
    fapIdentity(fapema),
    now,
  );
  assert.ok(rows.some((row) => row.sourceUrl === detailUrl));
  assert.ok(rows.every((row) => row.state === "MA"));
  assert.ok(rows.every((row) => row.installationId === "fap-ma"));
  assert.ok(rows.every((row) => row.organizationName === "FAPEMA"));
  assert.ok(!rows.some((row) => /resultado/i.test(row.title)));
  const withPeriod = rows.find((row) => row.sourceUrl === detailUrl)!;
  assert.equal(
    withPeriod.registrationTo?.toISOString(),
    "2026-09-14T15:00:00.000Z",
  );
});

test("FAPEMA: detail completa documentos e exige período", async () => {
  const now = new Date("2026-09-01T15:00:00Z");
  const listed = parseFapemaOpportunities(
    await fixture("fapema-editais-em-aberto.html"),
    FAPEMA_OPEN_PAGE,
    fapIdentity(fapema),
    now,
  ).find((row) => row.sourceUrl === detailUrl)!;
  const completed = fapemaDetail(
    listed,
    await fixture("fapema-detail.html"),
    fapIdentity(fapema),
    now,
  )!;
  assert.equal(completed.sourceUrl, detailUrl);
  assert.ok(completed.documents.length >= 1);
  assert.ok(
    completed.documents.every(
      (doc) => !/resultado|nota oficial/i.test(`${doc.title} ${doc.url}`),
    ),
  );
  assert.ok(completed.documents.length <= 5);
  assert.equal(
    fapemaDetail(
      { ...listed, registrationFrom: null, registrationTo: null },
      "<html><body><article>sem datas</article></body></html>",
      fapIdentity(fapema),
      now,
    ),
    null,
  );
});

test("coleta FAPEMA: home, listagem e detail com fixtures", async () => {
  const bodies = new Map([
    ["https://www.fapema.br/robots.txt", await fixture("fapema-robots.txt")],
    ["https://www.fapema.br/", await fixture("fapema-home.html")],
    [FAPEMA_OPEN_PAGE, await fixture("fapema-editais-em-aberto.html")],
    [detailUrl, await fixture("fapema-detail.html")],
  ]);
  const results = await collectFundingOnce({
    now: new Date("2026-09-01T15:00:00Z"),
    delayMs: 0,
    faps: [fapema],
    fetchText: async (url) => {
      if (bodies.has(url)) return bodies.get(url)!;
      // Demais posts da listagem: sem período → detail descarta.
      return "<html><body><article>sem período de submissão</article></body></html>";
    },
  });
  const fap = results.find((result) => result.installationId === "fap-ma")!;
  assert.equal(fap.outcome, "ok");
  assert.ok(fap.count >= 1);
  assert.ok(
    fap.drafts.every(
      (row) => row.state === "MA" && row.installationId === "fap-ma",
    ),
  );
  assert.ok(fap.drafts.some((row) => row.sourceUrl === detailUrl));
});
