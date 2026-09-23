import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://test:test@127.0.0.1:1/test";
process.env.PUBLIC_APP_ORIGIN = "http://localhost:24252";
delete process.env.AUTH_DEV_LOGIN;
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;

let server: Server;
let baseUrl: string;

describe("account HTTP security", () => {
  before(async () => {
    const { default: app } = await import("../app");
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    const { pool } = await import("@workspace/db");
    await pool.end();
  });

  it("returns the standard 401 envelope when no session exists", async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/session`);
    const body = (await response.json()) as {
      error: { code: string; requestId: string };
    };

    assert.equal(response.status, 401);
    assert.equal(body.error.code, "UNAUTHENTICATED");
    assert.ok(body.error.requestId);
  });

  it("redirects when Google OAuth credentials are unavailable", async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/google/start`, {
      redirect: "manual",
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/login?error=oauth_unavailable");
  });

  it("rejects logout without CSRF headers", async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: "POST",
    });
    assert.equal(response.status, 403);
  });

  it("accepts idempotent logout without a session when CSRF is valid", async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:24252",
        "X-Requested-With": "licita-insight",
      },
    });
    assert.equal(response.status, 204);
  });

  it("does not register dev login when disabled", async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "qa@example.test" }),
    });
    assert.equal(response.status, 404);
  });
});
