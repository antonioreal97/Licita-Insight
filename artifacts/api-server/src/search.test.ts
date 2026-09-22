import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import type { Server } from "node:http";
import type {
  ErrorResponse,
  SearchResponse,
  SuggestionsResponse,
  TenderDetail,
} from "@workspace/api-zod";
import app from "./app";

let server: Server;
let baseUrl: string;

const readJson = async <Response>(
  response: globalThis.Response,
): Promise<Response> => (await response.json()) as Response;

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("Search API v1.1", () => {
  it("returns at least 50 explicit fixture records", async () => {
    const response = await fetch(`${baseUrl}/tenders/search?pageSize=100`);
    assert.equal(response.status, 200);
    const body = await readJson<SearchResponse>(response);
    assert.equal(body.pagination.total, 60);
    assert.equal(body.data.length, 60);
    assert.match(body.data[0].source.name, /fixture/);
    assert.ok(
      body.data.every((tender) =>
        tender.estimatedValue === null
          ? tender.estimatedValueStatus !== "disclosed"
          : tender.estimatedValueStatus === "disclosed",
      ),
    );
    assert.ok(
      body.data.some(
        (tender) => tender.estimatedValueStatus === "confidential",
      ),
    );
    assert.ok(
      body.data.some(
        (tender) => tender.estimatedValueStatus === "not_published",
      ),
    );

    const facets = body.facets;
    assert.ok(facets);
    const histogram = facets.valueRange.histogram;
    assert.ok(histogram);
    assert.ok(histogram.length <= 12);
    assert.equal(
      histogram.reduce((total, bucket) => total + bucket.count, 0),
      body.data.filter((tender) => tender.estimatedValue !== null).length,
    );
  });

  it("combines repeated filters and calculates disjunctive facets", async () => {
    const response = await fetch(
      `${baseUrl}/tenders/search?status=open&state=SP&pageSize=100`,
    );
    assert.equal(response.status, 200);
    const body = await readJson<SearchResponse>(response);

    assert.ok(body.data.length > 0);
    assert.ok(
      body.data.every(
        (tender) => tender.status === "open" && tender.location.state === "SP",
      ),
    );
    const facets = body.facets;
    assert.ok(facets);
    assert.ok(facets.status.length > 1);
    assert.ok(facets.state.length > 1);

    const stateOnly = await readJson<SearchResponse>(
      await fetch(
        `${baseUrl}/tenders/search?state=SP&facets=false&pageSize=100`,
      ),
    );
    const statusOnly = await readJson<SearchResponse>(
      await fetch(
        `${baseUrl}/tenders/search?status=open&facets=false&pageSize=100`,
      ),
    );
    const groupTotals = facets.groupTotals;
    assert.ok(groupTotals);
    assert.equal(groupTotals.status, stateOnly.pagination.total);
    assert.equal(groupTotals.state, statusOnly.pagination.total);
  });

  it("keeps selected organizations outside the top 20", async () => {
    const response = await fetch(
      `${baseUrl}/tenders/search?organizationId=org-fixture-25&pageSize=100`,
    );
    const body = await readJson<SearchResponse>(response);
    const facets = body.facets;

    assert.equal(response.status, 200);
    assert.ok(facets);
    assert.equal(facets.organization.length, 21);
    const selected = facets.organization.find(
      (bucket) => bucket.value === "org-fixture-25",
    );
    assert.ok(selected);
    assert.match(selected.label, /25/);
    assert.ok(selected.count > 0);

    const zeroCountResponse = await fetch(
      `${baseUrl}/tenders/search?organizationId=org-fixture-25&state=ZZ`,
    );
    const zeroCountBody = await readJson<SearchResponse>(zeroCountResponse);
    const zeroCountFacets = zeroCountBody.facets;
    assert.ok(zeroCountFacets);
    assert.equal(
      zeroCountFacets.organization.find(
        (bucket) => bucket.value === "org-fixture-25",
      )?.count,
      0,
    );
  });

  it("calculates the city facet without its own filter and keeps state", async () => {
    const response = await fetch(
      `${baseUrl}/tenders/search?state=SP&city=9999999`,
    );
    const body = await readJson<SearchResponse>(response);
    const facets = body.facets;

    assert.equal(response.status, 200);
    assert.equal(body.pagination.total, 0);
    assert.ok(facets);
    assert.deepEqual(facets.city, [
      { value: "3550308", label: "São Paulo/SP", count: 5 },
    ]);
  });

  it("returns safe keyword highlights and reports the applied mode", async () => {
    const response = await fetch(
      `${baseUrl}/tenders/search?q=sistema&mode=hybrid`,
    );
    const body = await readJson<SearchResponse>(response);

    assert.equal(response.status, 200);
    assert.equal(body.meta.searchMode, "keyword");
    assert.equal(body.meta.searchModeFallbackReason, "not_available");
    assert.ok(body.data.length > 0);
    const fragments = body.data.flatMap(
      (tender: { relevance: { highlights: { fragments: string[] }[] } }) =>
        tender.relevance.highlights.flatMap((highlight) => highlight.fragments),
    );
    assert.ok(
      fragments.some((fragment: string) => fragment.includes("<mark>")),
    );
    assert.ok(
      fragments.every(
        (fragment: string) => !/<(?!\/?mark\b)[^>]+>/i.test(fragment),
      ),
    );

    const shortQuery = await readJson<SearchResponse>(
      await fetch(`${baseUrl}/tenders/search?q=ti&mode=semantic`),
    );
    assert.equal(shortQuery.meta.searchModeFallbackReason, "query_too_short");
  });

  it("can skip facets", async () => {
    const response = await fetch(`${baseUrl}/tenders/search?facets=false`);
    const body = await readJson<SearchResponse>(response);
    assert.equal(response.status, 200);
    assert.equal(body.facets, null);
  });

  it("returns the standard error envelope for invalid parameters", async () => {
    const response = await fetch(`${baseUrl}/tenders/search?pageSize=101`);
    const body = await readJson<ErrorResponse>(response);
    assert.equal(response.status, 400);
    assert.equal(body.error.code, "INVALID_PARAMETER");
    assert.equal(typeof body.error.requestId, "string");
  });

  it("returns detail and a standardized not-found response", async () => {
    const found = await fetch(`${baseUrl}/tenders/fixture-tender-001`);
    const foundBody = await readJson<TenderDetail>(found);
    assert.equal(found.status, 200);
    assert.equal(foundBody.id, "fixture-tender-001");
    assert.equal(foundBody.items.length, 1);

    const missing = await fetch(`${baseUrl}/tenders/missing`);
    const missingBody = await readJson<ErrorResponse>(missing);
    assert.equal(missing.status, 404);
    assert.equal(missingBody.error.code, "NOT_FOUND");
  });

  it("validates and limits suggestions", async () => {
    const response = await fetch(`${baseUrl}/search/suggestions?q=tec&limit=2`);
    const body = await readJson<SuggestionsResponse>(response);
    assert.equal(response.status, 200);
    assert.ok(body.suggestions.length <= 2);
    assert.ok(
      body.suggestions
        .filter((suggestion) => suggestion.type === "term")
        .every((suggestion) => suggestion.count !== null),
    );

    const organizationResponse = await fetch(
      `${baseUrl}/search/suggestions?q=${encodeURIComponent("órgão")}&limit=20`,
    );
    const organizationBody =
      await readJson<SuggestionsResponse>(organizationResponse);
    assert.ok(
      organizationBody.suggestions
        .filter((suggestion) => suggestion.type === "organization")
        .every((suggestion) => suggestion.count !== null),
    );

    const invalid = await fetch(`${baseUrl}/search/suggestions?q=a`);
    assert.equal(invalid.status, 400);

    const whitespaceOnly = await fetch(
      `${baseUrl}/search/suggestions?q=${encodeURIComponent("  ")}`,
    );
    assert.equal(whitespaceOnly.status, 400);
  });
});
