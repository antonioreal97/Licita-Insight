import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { businessDaysBefore, isBusinessDay } from "./business-days";

describe("business days", () => {
  it("skips weekends and fixed national holidays", () => {
    assert.equal(isBusinessDay("2026-10-12"), false);
    assert.equal(isBusinessDay("2026-10-10"), false);
    assert.equal(isBusinessDay("2026-11-20"), false);
    assert.equal(isBusinessDay("2026-10-13"), true);
  });

  it("knows Good Friday from Easter", () => {
    assert.equal(isBusinessDay("2026-04-03"), false);
    assert.equal(isBusinessDay("2027-03-26"), false);
    assert.equal(isBusinessDay("2026-04-02"), true);
  });

  it("counts back across a weekend and a holiday", () => {
    // Thursday 15/10/2026: 14 (1), 13 (2), 12 is Nossa Senhora Aparecida, weekend, 9 (3).
    assert.equal(businessDaysBefore("2026-10-15", 3), "2026-10-09");
    assert.equal(businessDaysBefore("2026-10-19", 1), "2026-10-16");
    assert.equal(businessDaysBefore("2027-01-04", 2), "2026-12-30");
  });

  it("refuses an invalid count or date instead of guessing", () => {
    assert.throws(() => businessDaysBefore("2026-10-15", 0), /positive integer/);
    assert.throws(() => businessDaysBefore("15/10/2026", 1), /Invalid date/);
  });
});
