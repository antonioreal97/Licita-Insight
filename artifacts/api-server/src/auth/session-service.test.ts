import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:1/test";

describe("session idle window", () => {
  it("keeps the current expiry during the first minute and then slides ten minutes", async () => {
    const { renewedExpiry, SESSION_IDLE_MS } = await import("./session-service");
    const now = new Date("2026-09-23T18:00:00.000Z");

    assert.equal(renewedExpiry(new Date(now.getTime() - 30_000), now), null);

    const renewed = renewedExpiry(new Date(now.getTime() - 60_000), now);
    assert.equal(renewed?.getTime(), now.getTime() + SESSION_IDLE_MS);
    assert.equal(SESSION_IDLE_MS, 10 * 60 * 1000);
  });
});

after(async () => {
  const { pool } = await import("@workspace/db");
  await pool.end();
});
