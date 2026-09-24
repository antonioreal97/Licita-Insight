import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dateInSaoPaulo,
  parseDateParameter,
} from "./sao-paulo-date";

describe("São Paulo date filters", () => {
  it("parses only real YYYY-MM-DD calendar dates", () => {
    assert.equal(
      parseDateParameter("2026-09-24")?.toISOString(),
      "2026-09-24T00:00:00.000Z",
    );
    assert.equal(parseDateParameter("2026-02-30"), null);
    assert.equal(parseDateParameter("24/09/2026"), null);
  });

  it("changes the local date at midnight in Brasília", () => {
    assert.equal(
      dateInSaoPaulo(new Date("2026-09-24T02:59:59.999Z")),
      "2026-09-23",
    );
    assert.equal(
      dateInSaoPaulo(new Date("2026-09-24T03:00:00.000Z")),
      "2026-09-24",
    );
  });
});
