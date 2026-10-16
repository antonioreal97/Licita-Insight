import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SearchCriteria } from "../domain/search";
import {
  getCachedTenderFacets,
  invalidateTenderFacetCache,
  tenderFacetCacheKey,
} from "./tender-facet-cache";

const criteria = (overrides: Partial<SearchCriteria> = {}): SearchCriteria => ({
  query: null,
  mode: "keyword",
  status: ["open"],
  modality: [],
  state: [],
  city: [],
  organizationId: [],
  sourceId: [],
  category: [],
  platform: [],
  newOnly: false,
  sort: "relevance",
  page: 1,
  pageSize: 20,
  facets: true,
  ...overrides,
});

describe("tender facet cache", () => {
  it("normalizes unordered filters and ignores pagination and ordering", () => {
    const first = criteria({ state: ["sp", "RJ"], category: ["b", "a"] });
    const second = criteria({
      state: ["RJ", "SP"],
      category: ["a", "b"],
      sort: "deadline_asc",
      page: 4,
      pageSize: 100,
    });
    assert.equal(tenderFacetCacheKey(first), tenderFacetCacheKey(second));
  });

  it("does not cache text or user-specific searches", () => {
    assert.equal(tenderFacetCacheKey(criteria({ query: "limpeza" })), null);
    assert.equal(tenderFacetCacheKey(criteria({ tenderIds: ["one"] })), null);
    assert.equal(tenderFacetCacheKey(criteria({ notificationId: "notification-one" })), null);
    assert.equal(tenderFacetCacheKey(criteria({ myRegion: true })), null);
    assert.equal(tenderFacetCacheKey(criteria({ serviceRegion: { scope: "national", mode: "prioritize", acceptsRemote: false } })), null);
  });

  it("serves a cached value and reloads it after collector invalidation", async () => {
    invalidateTenderFacetCache();
    const key = tenderFacetCacheKey(criteria())!;
    let total = 0;
    const load = async () => ({ total: ++total, facets: {} as never });

    assert.equal((await getCachedTenderFacets(key, load)).total, 1);
    assert.equal((await getCachedTenderFacets(key, load)).total, 1);
    invalidateTenderFacetCache();
    assert.equal((await getCachedTenderFacets(key, load)).total, 2);
  });
});
