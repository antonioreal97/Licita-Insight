import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  devEntitlementEnabled,
  entitlementSource,
  isEntitled,
  periodEndFromAsaasDate,
} from "./billing-access";
import { webhookPatch } from "./asaas-webhook";

const now = new Date("2026-10-01T12:00:00.000Z");

describe("subscription access", () => {
  it("denies access when there is no subscription", () => {
    assert.equal(isEntitled(null, now, {}), false);
  });

  it("allows an active subscription and a canceled one still inside the paid period", () => {
    assert.equal(isEntitled({ status: "active", currentPeriodEnd: null }, now, {}), true);
    assert.equal(
      isEntitled(
        { status: "canceled", currentPeriodEnd: new Date("2026-10-23T03:00:00.000Z") },
        now,
        {},
      ),
      true,
    );
  });

  it("denies pending, overdue, and canceled subscriptions after the period", () => {
    assert.equal(isEntitled({ status: "pending", currentPeriodEnd: null }, now, {}), false);
    assert.equal(isEntitled({ status: "past_due", currentPeriodEnd: null }, now, {}), false);
    assert.equal(
      isEntitled(
        { status: "canceled", currentPeriodEnd: new Date("2026-09-01T03:00:00.000Z") },
        now,
        {},
      ),
      false,
    );
  });

  it("allows development entitlement and identifies its source", () => {
    const env = { NODE_ENV: "development", BILLING_DEV_ENTITLED: "true" };
    assert.equal(devEntitlementEnabled(env), true);
    assert.equal(isEntitled(null, now, env), true);
    assert.equal(entitlementSource(null, now, env), "dev");
  });

  it("ignores development entitlement in production", () => {
    const env = { NODE_ENV: "production", BILLING_DEV_ENTITLED: "true" };
    assert.equal(devEntitlementEnabled(env), false);
    assert.equal(isEntitled(null, now, env), false);
    assert.equal(entitlementSource(null, now, env), null);
  });

  it("reports a paid subscription instead of the development fallback", () => {
    assert.equal(
      entitlementSource(
        { status: "active", currentPeriodEnd: null },
        now,
        { NODE_ENV: "development", BILLING_DEV_ENTITLED: "true" },
      ),
      "subscription",
    );
  });
});

describe("Asaas webhook", () => {
  it("activates until the next due date in São Paulo", () => {
    const patch = webhookPatch(
      "PAYMENT_RECEIVED",
      { customer: "cus_1", subscription: "sub_1", externalReference: "user_1" },
      "2026-11-01",
      null,
    );
    assert.equal(patch?.status, "active");
    assert.equal(patch?.currentPeriodEnd?.toISOString(), periodEndFromAsaasDate("2026-11-01").toISOString());
    assert.equal(patch?.asaasSubscriptionId, "sub_1");
  });

  it("treats a confirmed card payment the same way", () => {
    const patch = webhookPatch("PAYMENT_CONFIRMED", { subscription: "sub_1" }, "2026-11-01", null);
    assert.equal(patch?.status, "active");
  });

  it("refuses to activate without the next due date", () => {
    assert.throws(
      () => webhookPatch("PAYMENT_RECEIVED", { subscription: "sub_1" }, null, null),
      /nextDueDate/,
    );
  });

  it("marks the subscription overdue unless a later period is already paid", () => {
    const overdue = webhookPatch(
      "PAYMENT_OVERDUE",
      { dueDate: "2026-10-01", subscription: "sub_1" },
      null,
      { status: "active", currentPeriodEnd: periodEndFromAsaasDate("2026-10-01") },
    );
    assert.equal(overdue?.status, "past_due");

    const stale = webhookPatch(
      "PAYMENT_OVERDUE",
      { dueDate: "2026-09-01" },
      null,
      { status: "active", currentPeriodEnd: periodEndFromAsaasDate("2026-11-01") },
    );
    assert.equal(stale, null);
  });

  it("ends access when the payment is refunded", () => {
    const patch = webhookPatch("PAYMENT_REFUNDED", { subscription: "sub_1" }, null, {
      status: "active",
      currentPeriodEnd: periodEndFromAsaasDate("2026-11-01"),
    });
    assert.deepEqual(patch, {
      status: "canceled",
      asaasCustomerId: null,
      asaasSubscriptionId: "sub_1",
      currentPeriodEnd: null,
    });
  });

  it("ignores events that do not change access", () => {
    assert.equal(webhookPatch("PAYMENT_CREATED", {}, null, null), null);
  });
});
