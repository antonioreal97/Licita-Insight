export const JOURNEY_FLAGS = [
  "procurement",
  "funding",
  "study",
  "research",
  "culture",
] as const;
export type JourneyFlag = (typeof JOURNEY_FLAGS)[number];

export type JourneyFeatureFlags = {
  schemaVersion: 1;
  enabledJourneys: JourneyFlag[];
};

const allowed = new Set<string>(JOURNEY_FLAGS);

/** Empty or absent keeps every adaptive journey off and preserves the current UI. */
export function parseJourneyFeatureFlags(
  value: string | undefined,
): JourneyFeatureFlags {
  if (!value?.trim()) return { schemaVersion: 1, enabledJourneys: [] };
  const entries = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const invalid = entries.filter((entry) => !allowed.has(entry));
  if (invalid.length > 0) {
    throw new Error(
      `FEATURE_JOURNEYS contains unsupported values: ${[...new Set(invalid)].join(", ")}`,
    );
  }
  return {
    schemaVersion: 1,
    enabledJourneys: [...new Set(entries)] as JourneyFlag[],
  };
}

export const journeyFeatureFlagsFromEnv = (
  env: Readonly<{ FEATURE_JOURNEYS?: string }> = process.env,
): JourneyFeatureFlags => parseJourneyFeatureFlags(env.FEATURE_JOURNEYS);
