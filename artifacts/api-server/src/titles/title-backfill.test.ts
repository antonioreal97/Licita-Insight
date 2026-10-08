import assert from "node:assert/strict";
import { test } from "node:test";
import { titleBackfillAllowedAt, titleBackfillConfig } from "./title-backfill";

test("title backfill defaults on and stays out of the 06:00 collection hour", () => {
  const previous = process.env.TITLE_BACKFILL_ENABLED;
  delete process.env.TITLE_BACKFILL_ENABLED;
  try {
    assert.equal(titleBackfillConfig().enabled, true);
    assert.equal(titleBackfillAllowedAt(new Date("2026-10-08T09:30:00Z")), false);
    assert.equal(titleBackfillAllowedAt(new Date("2026-10-08T10:00:00Z")), true);
    process.env.TITLE_BACKFILL_ENABLED = "false";
    assert.equal(titleBackfillConfig().enabled, false);
  } finally {
    if (previous === undefined) delete process.env.TITLE_BACKFILL_ENABLED;
    else process.env.TITLE_BACKFILL_ENABLED = previous;
  }
});
