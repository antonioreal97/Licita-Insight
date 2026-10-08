import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOpportunityQuery } from "./opportunity-query";

test("opportunity query accepts multi-source kind and source filters", () => {
  const query = parseOpportunityQuery({
    q: "inovação",
    kind: ["funding", "innovation"],
    source: ["cnpq", "capes"],
  });
  assert.deepEqual(query.kind, ["funding", "innovation"]);
  assert.deepEqual(query.source, ["cnpq", "capes"]);
  assert.equal(query.query, "inovação");
});

test("opportunity query rejects an unknown source", () => {
  assert.throws(
    () => parseOpportunityQuery({ source: "private-portal" }),
    /source received an unknown value/,
  );
});
