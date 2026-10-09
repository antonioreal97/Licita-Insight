import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:1/test";
process.env.PUBLIC_APP_ORIGIN ??= "http://localhost:24252";
process.env.SESSION_SECRET ??= "billing-test-session-secret-32";
process.env.ASAAS_WEBHOOK_TOKEN = "billing-test-webhook-token";
process.env.LOG_LEVEL ??= "silent";

describe("Asaas webhook HTTP", () => {
  let server: Server | undefined;

  it("rejects a missing or wrong token and ignores unknown events", async () => {
    const { default: app } = await import("../app");
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const missing = await fetch(`${baseUrl}/api/v1/billing/asaas/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "PAYMENT_RECEIVED" }),
    });
    assert.equal(missing.status, 401);

    const wrong = await fetch(`${baseUrl}/api/v1/billing/asaas/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "asaas-access-token": "nope",
      },
      body: JSON.stringify({ event: "PAYMENT_RECEIVED" }),
    });
    assert.equal(wrong.status, 401);

    const ignored = await fetch(`${baseUrl}/api/v1/billing/asaas/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "asaas-access-token": "billing-test-webhook-token",
      },
      body: JSON.stringify({ event: "PAYMENT_CREATED" }),
    });
    assert.equal(ignored.status, 200);
    assert.deepEqual(await ignored.json(), { received: true });

    const adminMissing = await fetch(`${baseUrl}/api/v1/billing/coupons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationDays: 7 }),
    });
    assert.equal(adminMissing.status, 403);

    const redeemMissing = await fetch(`${baseUrl}/api/v1/me/billing/coupon`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "origin": process.env.PUBLIC_APP_ORIGIN,
        "x-requested-with": "licita-insight",
      },
      body: JSON.stringify({ code: "SETE-DIAS" }),
    });
    assert.equal(redeemMissing.status, 401);
  });

  after(async () => {
    if (!server) return;
    const listening = server;
    await new Promise<void>((resolve, reject) => {
      listening.close((error) => (error ? reject(error) : resolve()));
    });
  });
});

after(async () => {
  const { pool } = await import("@workspace/db");
  await pool.end();
});
