import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  TENDER_CATEGORIES,
  categoryLabel,
  isTenderCategorySlug,
  toTenderCategories,
} from "./tender-categories";

test("taxonomia publicada é idêntica à fixture dourada", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("../../scripts/fixtures/title-eval-gold.json", import.meta.url), "utf8"),
  ) as { taxonomy: unknown[] };
  assert.deepEqual(TENDER_CATEGORIES, fixture.taxonomy);
});

test("helpers validam, rotulam, deduplicam e limitam a duas categorias", () => {
  assert.equal(isTenderCategorySlug("limpeza-higiene"), true);
  assert.equal(isTenderCategorySlug("inexistente"), false);
  assert.equal(categoryLabel("veiculos-pecas"), "Veículos, peças e manutenção");
  assert.deepEqual(
    toTenderCategories(["limpeza-higiene", "limpeza-higiene", "inexistente", "outros", "ti-telecom"]),
    [
      { slug: "limpeza-higiene", label: "Limpeza, higiene e dedetização" },
      { slug: "outros", label: "Outros" },
    ],
  );
});
