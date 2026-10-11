import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MapasClientError } from "./mapas-errors";
import { mapasFixture } from "./mapas-fixtures";
import { bodySnippet, parseMapasListing } from "./mapas-response";

const URL = "https://mapa.cultura.es.gov.br/api/opportunity/find?@page=1";
const json = mapasFixture("es-open.json");

const invalidResponse = (error: unknown): error is MapasClientError =>
  error instanceof MapasClientError && error.kind === "invalid_response";

describe("parseMapasListing", () => {
  it("reads a recorded listing", () => {
    const parsed = parseMapasListing(
      { status: 200, body: json, contentType: "application/json" },
      URL,
    );
    assert.equal(parsed.recovered, false);
    assert.deepEqual(
      parsed.records.map((record) => record.id),
      [2314, 2578, 2656],
    );
  });

  it("reads the empty page the API answers past the last one", () => {
    const parsed = parseMapasListing(
      { status: 200, body: "[]", contentType: "application/json" },
      URL,
    );
    assert.deepEqual(parsed, { records: [], recovered: false });
  });

  it("reads a listing that starts with a byte order mark", () => {
    const parsed = parseMapasListing(
      { status: 200, body: `﻿${json}`, contentType: "application/json" },
      URL,
    );
    assert.equal(parsed.recovered, true);
    assert.equal(parsed.records.length, 3);
  });

  it("skips a PHP warning printed before the listing", () => {
    const warning =
      '<br />\n<b>Warning</b>:  Undefined array key "terms" in <b>/var/www/src/core/ApiQuery.php</b> on line <b>[1832]</b><br />\n';
    const parsed = parseMapasListing(
      { status: 200, body: `${warning}${json}`, contentType: "text/html" },
      URL,
    );
    assert.equal(parsed.recovered, true);
    assert.deepEqual(
      parsed.records.map((record) => record.id),
      [2314, 2578, 2656],
    );
  });

  it("does not take a bracket inside a notice for the listing", () => {
    assert.throws(
      () =>
        parseMapasListing(
          {
            status: 200,
            body: "<b>Notice</b>: Undefined offset in ApiQuery.php on line [12]",
            contentType: "text/html",
          },
          URL,
        ),
      invalidResponse,
    );
  });

  it("reports the HTML page an install answers with status 200, with content type and the start of the body", () => {
    const body = mapasFixture("es-continuous-flow-error.html");
    assert.throws(
      () =>
        parseMapasListing(
          { status: 200, body, contentType: "text/html; charset=UTF-8" },
          URL,
        ),
      (error: unknown) => {
        assert.ok(invalidResponse(error));
        assert.match(error.message, /non-JSON body/);
        assert.match(error.message, /status 200/);
        assert.match(error.message, /content-type text\/html; charset=UTF-8/);
        assert.match(error.message, /<!DOCTYPE html> <html lang=\\"pt_BR\\"/);
        assert.ok(error.message.includes(URL));
        // The start of the body, never the whole page.
        assert.ok(error.message.length < 600);
        return true;
      },
    );
  });

  it("rejects an empty body and a JSON object", () => {
    assert.throws(
      () => parseMapasListing({ status: 200, body: "  \n" }, URL),
      /empty body .*content-type ausente/,
    );
    assert.throws(
      () =>
        parseMapasListing(
          { status: 200, body: '{"error":true,"data":"invalid property"}' },
          URL,
        ),
      /listing was not an array/,
    );
  });

  it("drops entries that are not records", () => {
    const parsed = parseMapasListing(
      { status: 200, body: '[{"id":1,"name":"Edital"},null,3,[]]' },
      URL,
    );
    assert.deepEqual(parsed.records, [{ id: 1, name: "Edital" }]);
  });
});

describe("bodySnippet", () => {
  it("flattens whitespace and caps the length", () => {
    assert.equal(
      bodySnippet("<html>\n  <body>erro</body>\n</html>"),
      "<html> <body>erro</body> </html>",
    );
    assert.equal(bodySnippet("x".repeat(500)).length, 161);
  });
});
