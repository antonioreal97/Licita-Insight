import assert from "node:assert/strict";
import { test } from "node:test";
import {
  haversineKm,
  isWithinRadius,
  matchServiceRegion,
  municipalityForIbgeCode,
  statesForMacroregions,
  type ServiceRegionCoverage,
} from "./service-region";

test("haversine usa as sedes oficiais e preserva bordas inclusivas", () => {
  const campinas = municipalityForIbgeCode("3509502");
  const saoPaulo = municipalityForIbgeCode("3550308");
  assert.ok(campinas && saoPaulo);
  assert.ok(Math.abs(haversineKm(campinas, saoPaulo) - 88) < 2);

  const oneHundredKmNorth = { latitude: 100 / 111.195, longitude: 0 };
  const distance = haversineKm(
    { latitude: 0, longitude: 0 },
    oneHundredKmNorth,
  );
  assert.ok(Math.abs(distance - 100) < 0.01);
  assert.equal(isWithinRadius(100, 100), true);
  assert.equal(isWithinRadius(100.000_001, 100), false);
});

test("macrorregiões expandem para UFs sem duplicação", () => {
  assert.deepEqual(statesForMacroregions(["southeast"]), [
    "ES",
    "MG",
    "RJ",
    "SP",
  ]);
  assert.equal(statesForMacroregions(["north", "northeast"]).length, 16);
});

const coverage = (mode: "strict" | "prioritize"): ServiceRegionCoverage => ({
  scope: "custom",
  mode,
  acceptsRemote: false,
  regions: [],
  states: [],
  municipalities: [],
  radius: { center: municipalityForIbgeCode("3509502")!, km: 100 },
});

test("raio inclui a borda e distingue edital fora da região", () => {
  const inside = matchServiceRegion(coverage("strict"), {
    state: "SP",
    municipalityIbge: "3550308",
    categories: [],
  });
  const outside = matchServiceRegion(coverage("prioritize"), {
    state: "RJ",
    municipalityIbge: "3304557",
    categories: [],
  });
  assert.equal(inside.matches, true);
  assert.match(inside.reason, /até 100 km de Campinas-SP/);
  assert.equal(outside.matches, false);
  assert.equal(outside.reason, "Fora da sua região");
});

test("categoria remota pode atravessar a região quando a empresa aceita", () => {
  const result = matchServiceRegion(
    { ...coverage("strict"), acceptsRemote: true },
    {
      state: "AM",
      municipalityIbge: "1302603",
      categories: [{ slug: "ti-telecom" }],
    },
  );
  assert.equal(result.matches, true);
  assert.equal(result.remote, true);
});
