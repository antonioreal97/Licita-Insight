import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

// The real app with a database nobody listens on: the route must fail cleanly and still be rate limited.
process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:1/test";
process.env.PUBLIC_APP_ORIGIN = "http://localhost:24252";
process.env.LOG_LEVEL ??= "silent";
process.env.RATE_LIMIT_ANON_PER_MINUTE = "3";

let server: Server;
let baseUrl: string;

describe("GET /api/v1/public/tenders/by-state without a database", () => {
  before(async () => {
    const { default: app } = await import("../app");
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    const { pool } = await import("@workspace/db");
    await pool.end();
  });

  it("answers 503 without a session, never caches the failure and shares the public read window", async () => {
    const byState = () => fetch(`${baseUrl}/api/v1/public/tenders/by-state`);

    const first = await byState();
    assert.equal(first.status, 503);
    assert.equal(((await first.json()) as { error: { code: string } }).error.code, "SEARCH_UNAVAILABLE");
    assert.equal(first.headers.get("cache-control"), "no-store");
    assert.equal(first.headers.get("ratelimit-policy"), "3;w=60");
    assert.equal(first.headers.get("ratelimit-remaining"), "2");

    await byState();
    await byState();
    const limited = await byState();
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) >= 1);
  });
});
