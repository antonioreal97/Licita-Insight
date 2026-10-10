import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
const { explicitFilter } = await import("./company-fit-service");

type Profile = Parameters<typeof explicitFilter>[0];
type Tender = Parameters<typeof explicitFilter>[1];

const profile = {
  excludedKeywords: [],
  exclusions: [],
  coverage: { scope: "national", mode: "strict", acceptsRemote: false },
  valueRange: { min: 10_000, max: 5_000_000 },
} as unknown as Profile;

const tender = (estimatedValue: string | null, estimatedValueFlag: Tender["estimatedValueFlag"]): Tender => ({
  id: "T-value",
  title: "Aquisição de coletes de proteção balística",
  objectSummary: null,
  description: null,
  organizationName: "Órgão",
  estimatedValue,
  estimatedValueFlag,
  state: "AL",
  cityIbgeCode: null,
  items: [],
  categories: [],
  searchText: "aquisicao de coletes de protecao balistica",
});

test("faixa de valor do perfil: valor suspeito não elimina o edital", () => {
  assert.deepEqual(explicitFilter(profile, tender("938761000000.00", null)), [
    { kind: "out_of_value_range", estimatedValue: 938_761_000_000 },
  ]);
  assert.deepEqual(explicitFilter(profile, tender("938761000000.00", "absolute_ceiling")), []);
  assert.deepEqual(explicitFilter(profile, tender("900000.00", null)), []);
  assert.deepEqual(explicitFilter(profile, tender(null, null)), []);
});
