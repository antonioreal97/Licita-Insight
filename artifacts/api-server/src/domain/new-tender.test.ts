import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNewTenderPolicy, parseNewTenderWindowHours } from "./new-tender";

describe("new tender policy", () => {
  const now = new Date("2026-10-08T15:00:00.000Z");
  const policy = createNewTenderPolicy({ clock: () => now, windowHours: 24 });

  it("keeps a tender new immediately before the 24 hour boundary", () => {
    assert.equal(
      policy.snapshot(new Date("2026-10-07T15:00:00.001Z")).isNew,
      true,
    );
  });

  it("expires a tender at the exact 24 hour boundary", () => {
    assert.equal(
      policy.snapshot(new Date("2026-10-07T15:00:00.000Z")).isNew,
      false,
    );
  });

  it("does not mark a future timestamp as new", () => {
    assert.equal(
      policy.snapshot(new Date("2026-10-08T15:00:00.001Z")).isNew,
      false,
    );
  });

  it("uses 24 hours by default and validates configuration", () => {
    assert.equal(parseNewTenderWindowHours(undefined), 24);
    assert.equal(parseNewTenderWindowHours("48"), 48);
    assert.throws(() => parseNewTenderWindowHours("0"), /positive number/);
  });
});
