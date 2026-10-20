import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InvalidParameterError } from "./api-error";
import { parseOpportunityQuery } from "./opportunity-query";
import { parseSearchQuery } from "./query-parser";
import { MAX_RESULT_WINDOW, withinResultWindow } from "./result-window";
import { parseTransparencyQuery } from "./transparency-query";

describe("result window", () => {
  it("serves pages up to the thousandth result and refuses deeper ones", () => {
    assert.equal(MAX_RESULT_WINDOW, 1_000);
    assert.equal(parseSearchQuery({ page: "10", pageSize: "100" }).page, 10);
    assert.equal(parseSearchQuery({ page: "50", pageSize: "20" }).page, 50);
    assert.throws(() => parseSearchQuery({ page: "11", pageSize: "100" }), (error: unknown) =>
      error instanceof InvalidParameterError &&
      error.details?.some(({ field, issue }) => field === "page" && issue === "beyond_result_window") === true);
    assert.throws(() => parseSearchQuery({ page: "51" }), InvalidParameterError);
    assert.equal(parseTransparencyQuery({ page: "20", pageSize: "50" }).page, 20);
    assert.throws(() => parseTransparencyQuery({ page: "21", pageSize: "50" }), { status: 400 });
    assert.throws(() => parseOpportunityQuery({ page: "11", pageSize: "100" }), { status: 400 });
  });

  it("caps totalPages at the last page inside the window but keeps the real total", () => {
    const capped = withinResultWindow({ data: [], pagination: { page: 1, pageSize: 20, total: 201_713, totalPages: 10_086 } });
    assert.deepEqual(capped.pagination, { page: 1, pageSize: 20, total: 201_713, totalPages: 50 });
    const small = withinResultWindow({ pagination: { page: 1, pageSize: 20, total: 45, totalPages: 3 } });
    assert.equal(small.pagination.totalPages, 3);
  });
});
