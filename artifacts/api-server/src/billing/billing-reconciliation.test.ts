import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasSubscriptionEntitlement, periodEndFromAsaasDate } from "./billing-access";
import type { AsaasInvoice } from "./asaas-client";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:1/test";
process.env.LOG_LEVEL ??= "silent";
const { reconcilePatch } = await import("./billing-reconciliation");

const now = new Date("2026-10-13T15:00:00.000Z");
const end = (date: string) => periodEndFromAsaasDate(date);
const row = (
  status: string,
  currentPeriodEnd: Date | null,
  asaasSubscriptionId: string | null = "sub_1",
) => ({ status, currentPeriodEnd, asaasCustomerId: "cus_1", asaasSubscriptionId });
const remote = (
  payments: AsaasInvoice[],
  subscription: { status?: string; deleted?: boolean; nextDueDate?: string } = {},
) => ({
  subscription: { id: "sub_1", customer: "cus_1", status: "ACTIVE", nextDueDate: "2026-11-10", ...subscription },
  payments,
});
const pay = (id: string, status: string, dueDate: string): AsaasInvoice => ({
  id,
  status,
  dueDate,
  customer: "cus_1",
  subscription: "sub_1",
});

describe("billing reconciliation decision", () => {
  it("activates a pending row whose first charge was paid, until the next charge is due", () => {
    const patch = reconcilePatch(
      row("pending", null, null),
      remote([pay("pay_1", "RECEIVED", "2026-10-10"), pay("pay_2", "PENDING", "2026-11-10")], {
        nextDueDate: "2026-12-10",
      }),
    );
    assert.deepEqual(patch, {
      status: "active",
      asaasCustomerId: "cus_1",
      asaasSubscriptionId: "sub_1",
      currentPeriodEnd: end("2026-11-10"),
    });
  });

  it("uses the subscription nextDueDate when the next charge does not exist yet", () => {
    const patch = reconcilePatch(row("pending", null, null), remote([pay("pay_1", "CONFIRMED", "2026-10-10")]));
    assert.equal(patch?.status, "active");
    assert.equal(patch?.currentPeriodEnd?.toISOString(), end("2026-11-10").toISOString());
  });

  it("marks an active row overdue when the current charge is overdue", () => {
    const patch = reconcilePatch(
      row("active", end("2026-10-10")),
      remote([pay("pay_1", "RECEIVED", "2026-09-10"), pay("pay_2", "OVERDUE", "2026-10-10")]),
    );
    assert.equal(patch?.status, "past_due");
    assert.equal(patch?.currentPeriodEnd?.toISOString(), end("2026-10-10").toISOString());
  });

  it("does not regress an active row for an overdue charge older than the paid period", () => {
    assert.equal(
      reconcilePatch(row("active", end("2026-11-10")), remote([pay("pay_1", "OVERDUE", "2026-09-10")])),
      null,
    );
  });

  it("cancels and removes access when the latest charge was refunded", () => {
    const patch = reconcilePatch(
      row("active", end("2026-11-10")),
      remote([pay("pay_1", "REFUNDED", "2026-10-10")]),
    );
    assert.equal(patch?.status, "canceled");
    assert.equal(patch?.currentPeriodEnd, null);
    assert.equal(hasSubscriptionEntitlement(patch, now), false);
  });

  it("cancels a removed or inactive subscription without refund and keeps the paid period", () => {
    for (const state of [{ deleted: true }, { status: "INACTIVE" }, { status: "EXPIRED" }]) {
      const patch = reconcilePatch(
        row("active", end("2026-11-10")),
        remote([pay("pay_1", "RECEIVED", "2026-10-10")], state),
      );
      assert.equal(patch?.status, "canceled");
      assert.equal(patch?.currentPeriodEnd?.toISOString(), end("2026-11-10").toISOString());
      assert.equal(hasSubscriptionEntitlement(patch, now), true);
    }
  });

  it("reactivates a past_due row once the overdue charge is paid", () => {
    const patch = reconcilePatch(
      row("past_due", end("2026-10-10")),
      remote([pay("pay_1", "RECEIVED", "2026-09-10"), pay("pay_2", "RECEIVED", "2026-10-10")]),
    );
    assert.equal(patch?.status, "active");
    assert.equal(patch?.currentPeriodEnd?.toISOString(), end("2026-11-10").toISOString());
  });

  it("returns null when Asaas agrees with the local row", () => {
    assert.equal(
      reconcilePatch(
        row("active", end("2026-11-10")),
        remote([pay("pay_1", "RECEIVED", "2026-10-10"), pay("pay_2", "PENDING", "2026-11-10")]),
      ),
      null,
    );
    assert.equal(reconcilePatch(row("pending", null, null), remote([pay("pay_1", "PENDING", "2026-10-20")])), null);
  });

  it("keeps a voluntary cancellation with access until the paid period ends", () => {
    const canceled = row("canceled", end("2026-11-10"));
    assert.equal(
      reconcilePatch(canceled, remote([pay("pay_1", "RECEIVED", "2026-10-10")], { deleted: true })),
      null,
    );
    assert.equal(
      reconcilePatch(canceled, remote([pay("pay_0", "OVERDUE", "2026-09-10")], { deleted: true })),
      null,
    );
    assert.equal(hasSubscriptionEntitlement(canceled, now), true);
    assert.equal(hasSubscriptionEntitlement(canceled, end("2026-11-10")), false);
  });

  it("removes access at once when a voluntarily canceled period is refunded", () => {
    const patch = reconcilePatch(
      row("canceled", end("2026-11-10")),
      remote([pay("pay_1", "REFUNDED", "2026-10-10")], { deleted: true }),
    );
    assert.equal(patch?.status, "canceled");
    assert.equal(patch?.currentPeriodEnd, null);
    assert.equal(hasSubscriptionEntitlement(patch, now), false);
  });

  it("fails loudly when a paid charge has no period to activate", () => {
    assert.throws(
      () =>
        reconcilePatch(
          row("pending", null, null),
          remote([pay("pay_1", "RECEIVED", "2026-10-10")], { nextDueDate: undefined }),
        ),
      /nextDueDate/,
    );
  });
});
