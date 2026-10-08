import assert from "node:assert/strict";
import { test } from "node:test";
import { TENDER_CATEGORIES } from "../catalog/tender-categories";
import { categoriesFromOfficialTitle, categorySlugsFromOfficialTitle } from "./category-rules";

test("category rules normalize the official title and only emit teacher categories", () => {
  assert.deepEqual(categorySlugsFromOfficialTitle("AQUISIÇÃO DE PNEUS E ÓLEO DIESEL"), [
    "veiculos-pecas",
    "combustiveis-gas",
  ]);
  assert.deepEqual(categoriesFromOfficialTitle("Recarga de EXTINTORES de incêndio"), [{
    slug: "seguranca-incendio",
    label: "Segurança, vigilância e prevenção de incêndio",
  }]);
  assert.deepEqual(categorySlugsFromOfficialTitle("Objeto administrativo sem palavras específicas"), []);
  const allowed = new Set<string>(TENDER_CATEGORIES.map(({ slug }) => slug));
  for (const category of categoriesFromOfficialTitle("Locação de veículos para transporte escolar")) {
    assert.ok(allowed.has(category.slug));
  }
});
