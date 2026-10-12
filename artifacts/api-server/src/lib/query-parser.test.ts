import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InvalidParameterError } from "./api-error";
import { parseSearchQuery } from "./query-parser";

describe("search query parser", () => {
  it("keeps the notification id separate from ordinary search filters", () => {
    const criteria = parseSearchQuery({
      notification: "notice-1",
      pageSize: "50",
      facets: "false",
    });

    assert.equal(criteria.notificationId, "notice-1");
    assert.equal(criteria.tenderIds, undefined);
    assert.equal(criteria.pageSize, 50);
    assert.equal(criteria.facets, false);
  });

  it("rejects empty and oversized notification ids", () => {
    assert.throws(() => parseSearchQuery({ notification: "" }), InvalidParameterError);
    assert.throws(() => parseSearchQuery({ notification: "x".repeat(201) }), InvalidParameterError);
  });
});
