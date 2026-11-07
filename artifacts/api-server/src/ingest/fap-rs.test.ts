import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { collectFundingOnce } from "./funding-client";
import {
  FAPERGS_OPEN_LIST,
  fapergsDetail,
  fapergsPages,
  parseFapergsOpportunities,
} from "./fap-parsers-rs";
import { FAP_CATALOG, fapIdentity } from "./fap-sources";

const fixture = (name: string) =>
  readFile(
    fileURLToPath(new URL(`./fixtures/funding/fap/${name}`, import.meta.url)),
    "utf8",
  );

const fapergs = FAP_CATALOG.find((entry) => entry.uf === "RS")!;
const horizonUrl =
  "https://fapergs.rs.gov.br/programa-horizon-europe-da-comunidade-europeia";
const datedUrl =
  "https://fapergs.rs.gov.br/edital-99-2026-apoio-a-pesquisa-com-periodo";

test("FAPERGS: acha Abertos/Chamadas e usa o serviço da listagem", async () => {
  assert.deepEqual(fapergsPages(await fixture("fapergs-home.html")), [
    FAPERGS_OPEN_LIST,
  ]);
  assert.deepEqual(fapergsPages("<html></html>"), []);
});

test("FAPERGS: listagem Abertos vira chamadas do RS e exclui resultados", async () => {
  const now = new Date("2026-11-05T15:00:00Z");
  const rows = parseFapergsOpportunities(
    await fixture("fapergs-abertos.json"),
    FAPERGS_OPEN_LIST,
    fapIdentity(fapergs),
    now,
  );
  assert.equal(rows.length, 2);
  assert.ok(
    rows.every(
      (row) =>
        row.source === "fap" &&
        row.installationId === "fap-rs" &&
        row.state === "RS" &&
        row.organizationName === "FAPERGS" &&
        row.status === "open",
    ),
  );
  assert.ok(!rows.some((row) => /resultado/i.test(row.title)));
  assert.deepEqual(
    rows.map((row) => row.sourceUrl).sort(),
    [datedUrl, horizonUrl].sort(),
  );
  assert.deepEqual(Object.keys(rows[0]!.raw).sort(), ["sourceUrl"]);
});

test("FAPERGS: detail traz período e PDFs do edital, sem resultados", async () => {
  const now = new Date("2026-11-05T15:00:00Z");
  const listed = parseFapergsOpportunities(
    await fixture("fapergs-abertos.json"),
    FAPERGS_OPEN_LIST,
    fapIdentity(fapergs),
    now,
  );
  const dated = listed.find((row) => row.sourceUrl === datedUrl)!;
  const completed = fapergsDetail(
    dated,
    await fixture("fapergs-detail-dated.html"),
    fapIdentity(fapergs),
    now,
  )!;
  assert.equal(completed.sourceUrl, datedUrl);
  assert.equal(completed.registrationFrom?.toISOString().slice(0, 10), "2026-10-01");
  assert.equal(completed.registrationTo?.toISOString().slice(0, 10), "2026-11-30");
  assert.equal(completed.status, "open");
  assert.ok(completed.documents.length >= 1);
  assert.ok(completed.documents.length <= 5);
  assert.ok(
    completed.documents.every(
      (doc) =>
        /edital|retifica/i.test(doc.title) && !/resultado/i.test(doc.title),
    ),
  );

  const horizon = listed.find((row) => row.sourceUrl === horizonUrl)!;
  const openOnly = fapergsDetail(
    horizon,
    await fixture("fapergs-detail-horizon.html"),
    fapIdentity(fapergs),
    now,
  )!;
  assert.equal(openOnly.status, "open");
  assert.equal(openOnly.registrationFrom, null);
  assert.equal(openOnly.registrationTo, null);
  assert.ok(openOnly.documents.some((doc) => /horizon|guidelines/i.test(doc.title)));
});

test("coleta FAPERGS: home, serviço e detail com fixtures", async () => {
  const bodies = new Map([
    [
      "https://fapergs.rs.gov.br/robots.txt",
      await fixture("fapergs-robots.txt"),
    ],
    ["https://fapergs.rs.gov.br/", await fixture("fapergs-home.html")],
    [FAPERGS_OPEN_LIST, await fixture("fapergs-abertos.json")],
    [horizonUrl, await fixture("fapergs-detail-horizon.html")],
    [datedUrl, await fixture("fapergs-detail-dated.html")],
  ]);
  const results = await collectFundingOnce({
    now: new Date("2026-11-05T15:00:00Z"),
    delayMs: 0,
    faps: [fapergs],
    fetchText: async (url) => {
      const body = bodies.get(url);
      if (body === undefined) throw new Error(`URL inesperada: ${url}`);
      return body;
    },
  });
  const fap = results.find((result) => result.installationId === "fap-rs")!;
  assert.equal(fap.outcome, "ok");
  assert.equal(fap.count, 2);
  assert.equal(fap.drafts[0]!.state, "RS");
  const withPeriod = fap.drafts.find((draft) => draft.sourceUrl === datedUrl)!;
  assert.ok(withPeriod.registrationTo);
  assert.ok(withPeriod.documents.length >= 1);
});
