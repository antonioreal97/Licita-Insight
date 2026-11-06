import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { collectFundingOnce } from "./funding-client";
import {
  FACEPE_CONTINUOUS_PAGE,
  FACEPE_OPEN_PAGE,
  facepePages,
  parseFacepeOpportunities,
} from "./fap-parsers-pe";
import { FAP_CATALOG, fapIdentity } from "./fap-sources";

const fixture = (name: string) =>
  readFile(
    fileURLToPath(new URL(`./fixtures/funding/fap/${name}`, import.meta.url)),
    "utf8",
  );

const facepe = FAP_CATALOG.find((entry) => entry.uf === "PE")!;

test("FACEPE: acha abertos e fluxo contínuo na home", async () => {
  assert.deepEqual(facepePages(await fixture("facepe-home.html")), [
    FACEPE_OPEN_PAGE,
    FACEPE_CONTINUOUS_PAGE,
  ]);
  assert.deepEqual(facepePages("<html></html>"), []);
});

test("FACEPE: cards ?c=aberto viram chamadas open com documentos", async () => {
  const now = new Date("2026-11-05T15:00:00Z");
  const rows = parseFacepeOpportunities(
    await fixture("facepe-abertos.html"),
    FACEPE_OPEN_PAGE,
    fapIdentity(facepe),
    now,
  );
  assert.ok(rows.length >= 2);
  assert.ok(rows.every((row) => row.status === "open"));
  assert.ok(rows.every((row) => row.state === "PE"));
  assert.ok(rows.every((row) => row.installationId === "fap-pe"));
  assert.ok(rows.every((row) => row.organizationName === "FACEPE"));
  assert.ok(rows.every((row) => row.sourceUrl.startsWith(`${FACEPE_OPEN_PAGE}#`)));
  const bolsa = rows.find((row) => /35\/2026/.test(row.title))!;
  assert.ok(bolsa.documents.some((doc) => /\.pdf/i.test(doc.url)));
  assert.ok(
    bolsa.documents.every(
      (doc) => !/resultado|lista de espera/i.test(doc.title),
    ),
  );
  assert.deepEqual(Object.keys(bolsa.raw).sort(), ["anchor", "sourceUrl"]);
  const continuous = rows.find((row) => /fluxo\s+cont[ií]nuo/i.test(row.title));
  if (continuous) assert.equal(continuous.status, "open");
});

test("FACEPE: página de fluxo contínuo em construção não inventa chamada", async () => {
  const rows = parseFacepeOpportunities(
    await fixture("facepe-fluxo.html"),
    FACEPE_CONTINUOUS_PAGE,
    fapIdentity(facepe),
    new Date("2026-11-05T15:00:00Z"),
  );
  assert.equal(rows.length, 0);
});

test("coleta FACEPE: home e listagem com fixtures", async () => {
  const bodies = new Map([
    ["https://www.facepe.br/robots.txt", await fixture("facepe-robots.txt")],
    ["https://www.facepe.br/", await fixture("facepe-home.html")],
    [FACEPE_OPEN_PAGE, await fixture("facepe-abertos.html")],
    [FACEPE_CONTINUOUS_PAGE, await fixture("facepe-fluxo.html")],
  ]);
  const results = await collectFundingOnce({
    now: new Date("2026-11-05T15:00:00Z"),
    delayMs: 0,
    faps: [facepe],
    fetchText: async (url) => {
      const body = bodies.get(url);
      if (body === undefined) throw new Error(`URL inesperada: ${url}`);
      return body;
    },
  });
  const fap = results.find((result) => result.installationId === "fap-pe")!;
  assert.equal(fap.outcome, "ok");
  assert.ok(fap.count >= 2);
  assert.ok(fap.drafts.every((row) => row.status === "open" && row.state === "PE"));
});
