import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  devEntitlementEnabled,
  entitlementSource,
  hasSubscriptionEntitlement,
  isEntitled,
  periodEndFromAsaasDate,
} from "./billing-access";
import {
  googleTrialSubjectHash,
  trialEndsAtFrom,
} from "./trial-access";
import { paidPeriodNextDueDate, webhookPatch } from "./asaas-webhook";

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

  it("allows an active trial and expires it at the boundary", () => {
    const trialEndsAt = new Date("2026-10-02T12:00:00.000Z");
    const snapshot = { status: null, currentPeriodEnd: null, trialEndsAt };
    assert.equal(entitlementSource(snapshot, now, {}), "trial");
    assert.equal(isEntitled(snapshot, now, {}), true);
    assert.equal(entitlementSource(snapshot, trialEndsAt, {}), null);
  });

  it("prioritizes subscription, then trial, then development", () => {
    const env = { NODE_ENV: "development", BILLING_DEV_ENTITLED: "true" };
    assert.equal(
      entitlementSource(
        {
          status: "active",
          currentPeriodEnd: null,
          trialEndsAt: new Date("2026-10-02T12:00:00.000Z"),
        },
        now,
        env,
      ),
      "subscription",
    );
    assert.equal(
      entitlementSource(
        {
          status: "pending",
          currentPeriodEnd: null,
          trialEndsAt: new Date("2026-10-02T12:00:00.000Z"),
        },
        now,
        env,
      ),
      "trial",
    );
    assert.equal(
      entitlementSource(
        { status: "pending", currentPeriodEnd: null, trialEndsAt: now },
        now,
        env,
      ),
      "dev",
    );
  });

  it("recognizes a coupon until its exact boundary and keeps subscription priority", () => {
    const now = new Date("2026-10-08T12:00:00.000Z");
    const end = new Date(now.getTime() + 30 * 86_400_000);
    assert.equal(entitlementSource(null, now, {}, end), "coupon");
    assert.equal(entitlementSource(null, end, {}, end), null);
    assert.equal(
      entitlementSource({ status: "active", currentPeriodEnd: null }, now, {}, end),
      "subscription",
    );
  });

  it("distinguishes paid access so checkout remains available during trial", () => {
    assert.equal(
      hasSubscriptionEntitlement(
        {
          status: null,
          currentPeriodEnd: null,
          trialEndsAt: new Date("2026-10-02T12:00:00.000Z"),
        },
        now,
      ),
      false,
    );
  });
});

describe("trial identity", () => {
  it("creates a 7-day trial and a secret-keyed stable Google subject hash", () => {
    assert.equal(
      trialEndsAtFrom(now).toISOString(),
      "2026-10-08T12:00:00.000Z",
    );
    const first = googleTrialSubjectHash("google-subject", "secret-a");
    assert.equal(first, googleTrialSubjectHash("google-subject", "secret-a"));
    assert.notEqual(first, googleTrialSubjectHash("google-subject", "secret-b"));
    assert.equal(first.includes("google-subject"), false);
  });
});

describe("Asaas webhook", () => {
  it("ends a paid period at the next charge when later charges advanced the subscription date", () => {
    const nextDueDate = paidPeriodNextDueDate(
      "2026-11-13",
      [
        { dueDate: "2026-12-13" },
        { dueDate: "2026-11-13" },
        { dueDate: "2027-01-13" },
      ],
      "2027-02-13",
    );
    const patch = webhookPatch(
      "PAYMENT_RECEIVED",
      { subscription: "sub_1", dueDate: "2026-11-13" },
      nextDueDate,
      null,
    );
    assert.equal(nextDueDate, "2026-12-13");
    assert.equal(patch?.currentPeriodEnd?.toISOString(), periodEndFromAsaasDate("2026-12-13").toISOString());
  });

  it("uses the subscription date when its next charge has not been generated", () => {
    assert.equal(paidPeriodNextDueDate("2026-10-13", [{ dueDate: "2026-10-13" }], "2026-11-13"), "2026-11-13");
  });

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

describe("Asaas webhook redelivery", () => {
  type Row = { status: string; currentPeriodEnd: Date | null };
  const deliver = (row: Row, event: string, dueDate: string, nextDueDate: string | null = null): Row => {
    const patch = webhookPatch(event, { subscription: "sub_1", dueDate }, nextDueDate, row);
    return patch ? { status: patch.status, currentPeriodEnd: patch.currentPeriodEnd } : row;
  };
  const pending: Row = { status: "pending", currentPeriodEnd: null };

  it("keeps the period when PAYMENT_RECEIVED arrives again after the next charge was generated", () => {
    const first = deliver(pending, "PAYMENT_RECEIVED", "2026-10-10", "2026-11-10");
    const again = deliver(first, "PAYMENT_RECEIVED", "2026-10-10", "2026-12-10");
    assert.deepEqual(again, first);
    assert.equal(first.currentPeriodEnd?.toISOString(), periodEndFromAsaasDate("2026-11-10").toISOString());
  });

  it("ignores an old PAYMENT_OVERDUE delivered after a newer PAYMENT_RECEIVED", () => {
    const paid = deliver(
      deliver(pending, "PAYMENT_RECEIVED", "2026-09-10", "2026-10-10"),
      "PAYMENT_RECEIVED",
      "2026-10-10",
      "2026-11-10",
    );
    const late = deliver(paid, "PAYMENT_OVERDUE", "2026-09-10");
    assert.deepEqual(late, paid);
    assert.equal(late.status, "active");
  });

  it("does not reactivate an overdue subscription when an older payment is redelivered", () => {
    const overdue = deliver(
      deliver(pending, "PAYMENT_RECEIVED", "2026-09-10", "2026-10-10"),
      "PAYMENT_OVERDUE",
      "2026-10-10",
    );
    assert.equal(overdue.status, "past_due");
    assert.deepEqual(deliver(overdue, "PAYMENT_RECEIVED", "2026-09-10", "2026-11-10"), overdue);
    assert.equal(deliver(overdue, "PAYMENT_RECEIVED", "2026-10-10", "2026-11-10").status, "active");
  });

  it("repeats PAYMENT_OVERDUE and PAYMENT_REFUNDED without changing the result", () => {
    const active: Row = { status: "active", currentPeriodEnd: periodEndFromAsaasDate("2026-10-10") };
    const overdue = deliver(active, "PAYMENT_OVERDUE", "2026-10-10");
    assert.deepEqual(deliver(overdue, "PAYMENT_OVERDUE", "2026-10-10"), overdue);
    const refunded = deliver(active, "PAYMENT_REFUNDED", "2026-09-10");
    assert.deepEqual(deliver(refunded, "PAYMENT_REFUNDED", "2026-09-10"), refunded);
    assert.deepEqual(refunded, { status: "canceled", currentPeriodEnd: null });
  });

  it("keeps a voluntary cancellation entitled when an old overdue event is redelivered", () => {
    const canceled: Row = { status: "canceled", currentPeriodEnd: periodEndFromAsaasDate("2026-11-10") };
    assert.deepEqual(deliver(canceled, "PAYMENT_OVERDUE", "2026-09-10"), canceled);
    assert.deepEqual(deliver(canceled, "PAYMENT_RECEIVED", "2026-10-10", "2026-12-10"), canceled);
  });
});
