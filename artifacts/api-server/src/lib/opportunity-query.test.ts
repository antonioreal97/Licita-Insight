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

test("opportunity query accepts the federal culture sources", () => {
  const query = parseOpportunityQuery({
    source: ["transferegov", "funarte", "minc", "salic"],
    kind: "partnership",
  });
  assert.deepEqual(query.source, ["transferegov", "funarte", "minc", "salic"]);
  assert.deepEqual(query.kind, ["partnership"]);
});

test("opportunity query keeps national calls as the default scope", () => {
  assert.equal(parseOpportunityQuery({}).scope, "national");
  assert.equal(parseOpportunityQuery({ scope: "international" }).scope, "international");
  assert.equal(parseOpportunityQuery({ scope: "all" }).scope, "all");
  assert.throws(
    () => parseOpportunityQuery({ scope: "global" }),
    /scope received an unknown value/,
  );
  assert.throws(
    () => parseOpportunityQuery({ scope: ["national", "international"] }),
    /scope accepts a single value/,
  );
});

test("opportunity query accepts the international sources and filters", () => {
  const query = parseOpportunityQuery({
    scope: "international",
    source: ["worldbank", "eu_ft"],
    kind: "procurement",
    agency: "Banco Mundial",
    region: ["africa", "america-latina"],
    country: "br",
    language: ["EN", "fr"],
    opportunityType: "Obras",
    eligibility: ["yes", "conditional"],
    funding: "no",
  });
  assert.deepEqual(query.source, ["worldbank", "eu_ft"]);
  assert.deepEqual(query.kind, ["procurement"]);
  assert.deepEqual(query.agency, ["Banco Mundial"]);
  assert.deepEqual(query.region, ["africa", "america-latina"]);
  assert.deepEqual(query.country, ["BR"]);
  assert.deepEqual(query.language, ["en", "fr"]);
  assert.deepEqual(query.opportunityType, ["Obras"]);
  assert.deepEqual(query.eligibility, ["yes", "conditional"]);
  assert.deepEqual(query.funding, ["no"]);
});

test("opportunity query rejects unknown eligibility, region and country values", () => {
  assert.throws(
    () => parseOpportunityQuery({ eligibility: "maybe" }),
    /eligibility received an unknown value/,
  );
  assert.throws(
    () => parseOpportunityQuery({ region: "antartida" }),
    /region received an unknown value/,
  );
  assert.throws(
    () => parseOpportunityQuery({ country: "BRA" }),
    /country received an unknown value/,
  );
  assert.throws(
    () => parseOpportunityQuery({ language: "english" }),
    /language received an unknown value/,
  );
});
