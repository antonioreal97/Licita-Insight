import type { SearchFacets } from "@workspace/api-zod";
import type { SearchCriteria } from "../domain/search";
import { queryTokens } from "../domain/normalize";
import { createKeyedTimedCache } from "./timed-cache";

export const TENDER_FACET_CACHE_TTL_MS = 90_000;
export const TENDER_FACET_CACHE_MAX_STALENESS_MS = 120_000;
const TENDER_FACET_CACHE_MAX_ENTRIES = 256;

export type TenderFacetCacheValue = {
  facets: SearchFacets;
  total: number;
};

const cache = createKeyedTimedCache<string, TenderFacetCacheValue>({
  ttlMs: TENDER_FACET_CACHE_TTL_MS,
  staleWhileRevalidateMs:
    TENDER_FACET_CACHE_MAX_STALENESS_MS - TENDER_FACET_CACHE_TTL_MS,
  retryMs: 5_000,
  maxEntries: TENDER_FACET_CACHE_MAX_ENTRIES,
  // A failed refresh is surfaced once the documented stale-while-revalidate window closes.
  staleOnError: false,
});

const sorted = (values: readonly string[]): string[] => [...values].sort();
const dateKey = (value: Date | undefined): string | null =>
  value?.toISOString() ?? null;

const databaseScope = (): string => {
  const raw = process.env.DATABASE_URL;
  if (!raw) return "database-unset";
  try {
    const url = new URL(raw);
    return `${url.host}${url.pathname}?options=${url.searchParams.get("options") ?? ""}`;
  } catch {
    return "database-invalid";
  }
};

/**
 * Page, page size and ordering do not change facets. Personal snapshots and service regions stay uncached because
 * their high-cardinality keys would evict the public searches this cache is meant to accelerate.
 */
export const tenderFacetCacheKey = (
  criteria: SearchCriteria,
): string | null => {
  if (
    queryTokens(criteria.query).length > 0 ||
    criteria.tenderIds !== undefined ||
    criteria.notificationId !== undefined ||
    criteria.myRegion ||
    criteria.serviceRegion !== undefined
  ) {
    return null;
  }

  return JSON.stringify({
    database: databaseScope(),
    status: sorted(criteria.status),
    modality: sorted(criteria.modality),
    state: sorted(criteria.state.map((state) => state.toUpperCase())),
    city: sorted(criteria.city),
    organizationId: sorted(criteria.organizationId),
    sourceId: sorted(criteria.sourceId),
    category: sorted(criteria.category),
    platform: sorted(criteria.platform),
    newOnly: criteria.newOnly,
    valueMin: criteria.valueMin ?? null,
    valueMax: criteria.valueMax ?? null,
    publishedFrom: dateKey(criteria.publishedFrom),
    publishedTo: dateKey(criteria.publishedTo),
    deadlineFrom: dateKey(criteria.deadlineFrom),
    deadlineTo: dateKey(criteria.deadlineTo),
  });
};

export const getCachedTenderFacets = (
  key: string,
  load: () => Promise<TenderFacetCacheValue>,
): Promise<TenderFacetCacheValue> => cache.get(key, load);

/** Called after a collector batch commits so the next search observes its exact counts. */
export const invalidateTenderFacetCache = (): void => cache.clear();
