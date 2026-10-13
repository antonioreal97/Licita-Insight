import assert from "node:assert/strict";
import { test } from "node:test";
import { periodEndFromAsaasDate } from "./billing-access";
import { BillingUnavailableError } from "../lib/api-error";
import { AsaasNotFoundError, type AsaasInvoice, type AsaasSubscription } from "./asaas-client";
import type { AsaasReader } from "./billing-reconciliation";

test("billing reconciliation writes only real divergences in PostgreSQL", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  const schema = `billing_reconcile_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  const { db, pool, usersTable, subscriptionsTable } = await import("@workspace/db");
  const { reconcileSubscriptions } = await import("./billing-reconciliation");

  await pool.query(`CREATE SCHEMA "${schema}"`);
  for (const table of ["users", "subscriptions"]) {
    await pool.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
  }

  const now = new Date("2026-10-13T15:00:00.000Z");
  const end = periodEndFromAsaasDate;
  const stamp = new Date("2026-10-01T00:00:00.000Z");
  // Rows start without asaasCustomerId: filling it in alone must not count as a change.
  const users = ["u1-pending", "u2-active", "u3-past-due", "u4-refunded", "u5-removed", "u6-canceled", "u7-same", "u8-expired"];
  await db.insert(usersTable).values(users.map((id) => ({ id, email: `${id}@example.test` })));
  await db.insert(subscriptionsTable).values([
    { userId: "u1-pending", status: "pending", asaasPaymentLinkId: "lnk_1", updatedAt: stamp },
    { userId: "u2-active", status: "active", asaasSubscriptionId: "sub_2", currentPeriodEnd: end("2026-10-10"), updatedAt: stamp },
    { userId: "u3-past-due", status: "past_due", asaasSubscriptionId: "sub_3", currentPeriodEnd: end("2026-10-10"), updatedAt: stamp },
    { userId: "u4-refunded", status: "active", asaasSubscriptionId: "sub_4", currentPeriodEnd: end("2026-11-10"), updatedAt: stamp },
    { userId: "u5-removed", status: "active", asaasSubscriptionId: "sub_5", currentPeriodEnd: end("2026-11-10"), updatedAt: stamp },
    { userId: "u6-canceled", status: "canceled", asaasSubscriptionId: "sub_6", currentPeriodEnd: end("2026-11-10"), updatedAt: stamp },
    { userId: "u7-same", status: "active", asaasSubscriptionId: "sub_7", currentPeriodEnd: end("2026-11-10"), updatedAt: stamp },
    { userId: "u8-expired", status: "canceled", asaasSubscriptionId: "sub_8", currentPeriodEnd: end("2026-09-10"), updatedAt: stamp },
  ]);

  const pay = (subscription: string, status: string, dueDate: string): AsaasInvoice => ({
    id: `${subscription}_${dueDate}`,
    status,
    dueDate,
    subscription,
    customer: "cus_x",
  });
  const subscriptions: Record<string, AsaasSubscription> = {
    sub_1: { id: "sub_1", customer: "cus_x", status: "ACTIVE", nextDueDate: "2026-11-12" },
    sub_2: { id: "sub_2", customer: "cus_x", status: "ACTIVE", nextDueDate: "2026-11-10" },
    sub_3: { id: "sub_3", customer: "cus_x", status: "ACTIVE", nextDueDate: "2026-11-10" },
    sub_4: { id: "sub_4", customer: "cus_x", status: "ACTIVE", nextDueDate: "2026-11-10" },
    sub_5: { id: "sub_5", customer: "cus_x", status: "INACTIVE", deleted: true, nextDueDate: "2026-11-10" },
    sub_6: { id: "sub_6", customer: "cus_x", status: "INACTIVE", deleted: true, nextDueDate: "2026-11-10" },
    sub_7: { id: "sub_7", customer: "cus_x", status: "ACTIVE", nextDueDate: "2026-11-10" },
  };
  const payments: Record<string, AsaasInvoice[]> = {
    sub_1: [pay("sub_1", "RECEIVED", "2026-10-12")],
    sub_2: [pay("sub_2", "RECEIVED", "2026-09-10"), pay("sub_2", "OVERDUE", "2026-10-10")],
    sub_3: [pay("sub_3", "RECEIVED", "2026-10-10")],
    sub_4: [pay("sub_4", "REFUNDED", "2026-10-10")],
    sub_5: [pay("sub_5", "RECEIVED", "2026-10-10")],
    sub_6: [pay("sub_6", "RECEIVED", "2026-10-10")],
    sub_7: [pay("sub_7", "RECEIVED", "2026-10-10"), pay("sub_7", "PENDING", "2026-11-10")],
  };
  const calls: string[] = [];
  let failing = new Set<string>();
  let missingSubscription = new Set<string>();
  let missingPayments = new Set<string>();
  const notFound = () => new AsaasNotFoundError("O Asaas recusou o pagamento (HTTP 404).");
  const reader: AsaasReader = {
    async getSubscription(id) {
      calls.push(`subscription:${id}`);
      if (failing.has(id)) throw new BillingUnavailableError("O Asaas recusou o pagamento (HTTP 503).");
      if (missingSubscription.has(id)) throw notFound();
      return subscriptions[id]!;
    },
    async listSubscriptionPayments(id) {
      calls.push(`payments:${id}`);
      if (missingPayments.has(id)) throw notFound();
      return payments[id] ?? [];
    },
    async listPaymentsByExternalReference(reference) {
      calls.push(`reference:${reference}`);
      return reference === "u1-pending" ? [{ ...pay("sub_1", "RECEIVED", "2026-10-12"), paymentLink: "lnk_1" }] : [];
    },
  };
  const snapshot = async () =>
    Object.fromEntries(
      (await db.select().from(subscriptionsTable)).map((row) => [
        row.userId,
        `${row.status}|${row.currentPeriodEnd?.toISOString() ?? "null"}|${row.asaasSubscriptionId ?? "null"}|${row.updatedAt.toISOString()}`,
      ]),
    );
  const options = { maxRows: 100, pauseMs: 0, reader, now };

  try {
    await t.test("dry-run counts transitions without writing", async () => {
      const before = await snapshot();
      const result = await reconcileSubscriptions({ ...options, dryRun: true });
      assert.deepEqual(await snapshot(), before);
      assert.equal(result.checked, 7);
      assert.deepEqual(result.transitions, {
        "pending->active": 1,
        "active->past_due": 1,
        "past_due->active": 1,
        "active->canceled": 2,
      });
      assert.equal(result.unchanged, 2);
    });

    await t.test("an Asaas failure leaves the row as is and the rest proceeds", async () => {
      failing = new Set(["sub_2"]);
      const before = await snapshot();
      const result = await reconcileSubscriptions(options);
      failing = new Set();
      const after = await snapshot();
      assert.equal(result.failed, 1);
      assert.equal(after["u2-active"], before["u2-active"]);
      assert.equal(after["u6-canceled"], before["u6-canceled"]);
      assert.equal(after["u7-same"], before["u7-same"]);
      assert.equal(after["u8-expired"], before["u8-expired"]);

      const rows = Object.fromEntries((await db.select().from(subscriptionsTable)).map((row) => [row.userId, row]));
      assert.equal(rows["u1-pending"]?.status, "active");
      assert.equal(rows["u1-pending"]?.asaasSubscriptionId, "sub_1");
      assert.equal(rows["u1-pending"]?.asaasCustomerId, "cus_x");
      assert.equal(rows["u1-pending"]?.currentPeriodEnd?.toISOString(), end("2026-11-12").toISOString());
      assert.equal(rows["u3-past-due"]?.status, "active");
      assert.equal(rows["u3-past-due"]?.currentPeriodEnd?.toISOString(), end("2026-11-10").toISOString());
      assert.equal(rows["u4-refunded"]?.status, "canceled");
      assert.equal(rows["u4-refunded"]?.currentPeriodEnd, null);
      assert.equal(rows["u5-removed"]?.status, "canceled");
      assert.equal(rows["u5-removed"]?.currentPeriodEnd?.toISOString(), end("2026-11-10").toISOString());
    });

    await t.test("the next run fixes the failed row and a repeated run writes nothing", async () => {
      const second = await reconcileSubscriptions(options);
      assert.deepEqual(second.transitions, { "active->past_due": 1 });
      const settled = await snapshot();
      const third = await reconcileSubscriptions(options);
      assert.deepEqual(third.transitions, {});
      assert.equal(third.failed, 0);
      assert.deepEqual(await snapshot(), settled);
    });

    await t.test("subscriptions missing in Asaas are counted apart, untouched, and never abort the run", async () => {
      missingSubscription = new Set(["sub_2", "sub_3"]);
      missingPayments = new Set(["sub_5", "sub_6"]);
      const before = await snapshot();
      const dryRun = await reconcileSubscriptions({ ...options, dryRun: true });
      const result = await reconcileSubscriptions(options);
      missingSubscription = new Set();
      missingPayments = new Set();
      assert.deepEqual(await snapshot(), before);
      for (const run of [dryRun, result]) {
        assert.equal(run.missingRemote, 4);
        assert.equal(run.failed, 0);
        assert.equal(run.aborted, false);
        assert.equal(run.checked, 6);
        assert.equal(run.nextUserId, null);
      }
    });

    await t.test("the per-run cap is respected and the cursor resumes", async () => {
      calls.length = 0;
      const first = await reconcileSubscriptions({ ...options, maxRows: 2 });
      assert.equal(first.checked, 2);
      assert.notEqual(first.nextUserId, null);
      const rest = await reconcileSubscriptions({ ...options, afterUserId: first.nextUserId });
      assert.equal(rest.nextUserId, null);
      assert.equal(first.checked + rest.checked, 6);
    });

    await t.test("consecutive Asaas failures stop the run without writing", async () => {
      failing = new Set(["sub_2", "sub_3", "sub_5", "sub_6", "sub_7"]);
      const before = await snapshot();
      const result = await reconcileSubscriptions(options);
      failing = new Set();
      assert.equal(result.aborted, true);
      assert.equal(result.failed, 3);
      assert.deepEqual(await snapshot(), before);
    });
  } finally {
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  }
});
