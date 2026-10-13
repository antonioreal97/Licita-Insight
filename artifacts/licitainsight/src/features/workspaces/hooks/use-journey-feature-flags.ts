import { useQuery } from '@tanstack/react-query';
import { getJson } from '@/api/adapters/http/http-client';

export type JourneyFlag = 'procurement' | 'funding' | 'study' | 'research' | 'culture';
export type JourneyFeatureFlags = {
  schemaVersion: 1;
  enabledJourneys: JourneyFlag[];
};

const NO_ADAPTIVE_JOURNEYS: JourneyFeatureFlags = {
  schemaVersion: 1,
  enabledJourneys: [],
};

export const getJourneyFeatureFlags = (signal?: AbortSignal): Promise<JourneyFeatureFlags> =>
  getJson<JourneyFeatureFlags>('/v1/public/feature-flags', {}, signal);

/** Phase 0 only: no component consumes this hook, so the default UI is unchanged. */
export function useJourneyFeatureFlags() {
  return useQuery({
    queryKey: ['feature-flags', 'journeys'],
    queryFn: ({ signal }) => getJourneyFeatureFlags(signal),
    placeholderData: NO_ADAPTIVE_JOURNEYS,
    staleTime: 60_000,
  });
}
