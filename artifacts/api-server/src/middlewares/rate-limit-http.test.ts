import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

// The real app with its middleware order and env-driven config. None of these requests reach the database.
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:1/test";
process.env.PUBLIC_APP_ORIGIN = "http://localhost:24252";
process.env.LOG_LEVEL ??= "silent";
process.env.RATE_LIMIT_PUBLIC_WRITE_PER_MINUTE = "2";
process.env.RATE_LIMIT_ANON_PER_MINUTE = "5";
delete process.env.ASAAS_WEBHOOK_TOKEN;

let server: Server;
let baseUrl: string;

describe("rate limit profiles through the app", () => {
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

  it("limits public writes per IP without touching the read bucket or the exemptions", async () => {
    const unsubscribe = () =>
      fetch(`${baseUrl}/api/v1/email/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Rejected by validation before any database access.
        body: JSON.stringify({ token: "x".repeat(501), scope: "all" }),
      });
    const logout = () =>
      fetch(`${baseUrl}/api/v1/auth/logout`, {
        method: "POST",
        headers: { Origin: "http://localhost:24252", "X-Requested-With": "licita-insight" },
      });

    const first = await unsubscribe();
    assert.equal(first.status, 400);
    assert.equal(first.headers.get("ratelimit-policy"), "2;w=60");
    assert.equal(first.headers.get("ratelimit-remaining"), "1");
    // Anonymous logout is also a public write, so it shares the per-IP bucket.
    assert.equal((await logout()).status, 204);

    const limited = await unsubscribe();
    assert.equal(limited.status, 429);
    const retryAfter = Number(limited.headers.get("retry-after"));
    assert.ok(retryAfter >= 1 && retryAfter <= 60, `Retry-After ${retryAfter} within the 60 s window`);
    const body = (await limited.json()) as { error: { code: string; requestId: string } };
    assert.equal(body.error.code, "RATE_LIMITED");
    assert.ok(body.error.requestId);
    assert.equal(limited.headers.get("cache-control"), "no-store");

    // Other profiles are unaffected: an unmapped public GET uses the read bucket…
    const plan = await fetch(`${baseUrl}/api/v1/billing/plan`);
    assert.equal(plan.status, 200);
    assert.equal(plan.headers.get("ratelimit-policy"), "5;w=60");
    // …and health and the Asaas webhook stay outside any window.
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await fetch(`${baseUrl}/api/healthz`)).status, 200);
      const webhook = await fetch(`${baseUrl}/api/v1/billing/asaas/webhook`, { method: "POST" });
      assert.notEqual(webhook.status, 429);
      assert.equal(webhook.headers.get("ratelimit-limit"), null);
    }
  });
});
