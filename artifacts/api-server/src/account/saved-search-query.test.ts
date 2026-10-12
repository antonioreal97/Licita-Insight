import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InvalidParameterError } from "../lib/api-error";
import { canonicalSearchQuery } from "./saved-search-query";

describe("saved search query", () => {
  it("canonicalizes without a question mark and removes presentation params", () => {
    const result = canonicalSearchQuery(
      "?state=df&q= limpeza &page=3&pageSize=50&view=map&facets=true&status=open",
    );

    assert.equal(result.query, "q=limpeza&status=open&state=DF");
    assert.equal(result.criteria.page, 1);
    assert.equal(result.criteria.facets, false);
  });

  it("rejects unknown and invalid search parameters", () => {
    assert.throws(
      () => canonicalSearchQuery("internalColumn=value"),
      InvalidParameterError,
    );
    assert.throws(
      () => canonicalSearchQuery("valueMin=200&valueMax=100"),
      InvalidParameterError,
    );
    assert.throws(
      () => canonicalSearchQuery("q=software&notification=notice-1"),
      InvalidParameterError,
    );
  });
});
