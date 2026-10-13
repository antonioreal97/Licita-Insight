import assert from "node:assert/strict";
import test from "node:test";
import { parseJourneyFeatureFlags } from "./journey-flags";

test("journey flags default to no adaptive journey", () => {
  assert.deepEqual(parseJourneyFeatureFlags(undefined), {
    schemaVersion: 1,
    enabledJourneys: [],
  });
  assert.deepEqual(parseJourneyFeatureFlags("  "), {
    schemaVersion: 1,
    enabledJourneys: [],
  });
});

test("journey flags normalize and deduplicate the allow-list", () => {
  assert.deepEqual(parseJourneyFeatureFlags(" funding, CULTURE, funding "), {
    schemaVersion: 1,
    enabledJourneys: ["funding", "culture"],
  });
});

test("journey flags reject a typo instead of silently enabling an unknown journey", () => {
  assert.throws(
    () => parseJourneyFeatureFlags("funding,studdy"),
    /unsupported values: studdy/,
  );
});
