import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { activeFaps, FAP_CATALOG } from "./fap-sources";

test("FAPEAM: aguarda listagem permitida; não ativa endpoint de dados bloqueado", async () => {
  const entry = FAP_CATALOG.find((row) => row.uf === "AM")!;
  const robots = await readFile(
    new URL("./fixtures/funding/fap/fapeam-robots.txt", import.meta.url),
    "utf8",
  );
  assert.equal(entry.collection, "pending");
  assert.equal(entry.adapter, undefined);
  assert.deepEqual(activeFaps("am"), []);
  // Evidência literal: o parser compartilhado ainda perde grupos após linhas em branco.
  assert.match(robots, /^Disallow: \/wp-admin\/\s*$/m);
  assert.match(robots, /^Disallow: \/feed\/\s*$/m);
  assert.doesNotMatch(robots, /^Allow: \/wp-admin\/admin-ajax\.php/m);
});
