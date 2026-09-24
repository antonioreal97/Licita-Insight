import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { millisecondsUntilSaoPauloHour } from "../lib/sao-paulo-schedule";

describe("email digest schedule", () => {
  it("schedules 07:00 in America/Sao_Paulo", () => {
    assert.equal(
      millisecondsUntilSaoPauloHour(
        7,
        new Date("2026-09-24T09:30:00.000Z"),
      ),
      30 * 60 * 1_000,
    );
    assert.equal(
      millisecondsUntilSaoPauloHour(
        7,
        new Date("2026-09-24T10:00:01.000Z"),
      ),
      24 * 60 * 60 * 1_000 - 1_000,
    );
  });
});
