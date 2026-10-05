import assert from "node:assert/strict";
import test from "node:test";
import { parseTransparencyQuery } from "./transparency-query";

test("transparency query accepts a bounded search with dates and sorting", () => {
  const parsed = parseTransparencyQuery({
    q: "  empresa  ", state: "sp", publishedFrom: "2026-10-01", publishedTo: "2026-10-05",
    valueMin: "0", valueMax: "12000", page: "2", pageSize: "25", sort: "value_desc",
  });
  assert.equal(parsed.query, "empresa");
  assert.equal(parsed.state, "SP");
  assert.equal(parsed.page, 2);
  assert.equal(parsed.pageSize, 25);
  assert.equal(parsed.sort, "value_desc");
});

test("transparency query rejects invalid ranges and excessive page size", () => {
  assert.throws(() => parseTransparencyQuery({ publishedFrom: "2026-10-05", publishedTo: "2026-10-01" }), { status: 400 });
  assert.throws(() => parseTransparencyQuery({ valueMin: "10", valueMax: "1" }), { status: 400 });
  assert.throws(() => parseTransparencyQuery({ pageSize: "51" }), { status: 400 });
  assert.throws(() => parseTransparencyQuery({ sort: "unknown" }), { status: 400 });
});
