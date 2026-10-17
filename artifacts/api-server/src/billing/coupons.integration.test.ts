import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("coupons persist, extend access and redeem idempotently with PostgreSQL", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  const schema = `coupon_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  const { db, pool, usersTable, subscriptionsTable, couponCodesTable, couponRedemptionsTable } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const { createCoupon, redeemCoupon, activeCouponAccessUntil } = await import("./coupons");
  const { getBilling } = await import("./billing-service");
  const betaMigration = readFileSync(path.join(repoRoot, "lib/db/migrations/0018_beta_access.sql"), "utf8");
  const migration = readFileSync(path.join(repoRoot, "lib/db/migrations/0035_coupons.sql"), "utf8");

  await pool.query(`CREATE SCHEMA "${schema}"`);
  for (const table of ["users", "subscriptions"]) {
    await pool.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
  }
  await pool.query(betaMigration);
  await pool.query(migration);
  const now = new Date("2026-10-08T12:00:00.000Z");
  const user = { id: "coupon-user", email: "coupon@example.test" };
  const other = { id: "coupon-other", email: "other@example.test" };
  const payer = { id: "coupon-payer", email: "payer@example.test" };
  await db.insert(usersTable).values([
    { ...user, trialEndsAt: new Date("2026-10-01T00:00:00.000Z") },
    { ...other, trialEndsAt: new Date("2026-10-01T00:00:00.000Z") },
    { ...payer, trialEndsAt: new Date("2026-10-01T00:00:00.000Z") },
  ]);

  try {
    await t.test("7-day coupon is granted from now and a retry is idempotent", async () => {
      const issued = await createCoupon({ code: "SETE-DIAS", durationDays: 7 });
      const first = await redeemCoupon(user.id, { code: " sete-dias " }, now);
      assert.equal(first.durationDays, 7);
      assert.equal(first.alreadyRedeemed, false);
      assert.equal(first.accessUntil, new Date(now.getTime() + 7 * 86_400_000).toISOString());
      const retry = await redeemCoupon(user.id, { code: issued.code }, new Date(now.getTime() + 86_400_000));
      assert.equal(retry.alreadyRedeemed, true);
      assert.equal(retry.accessUntil, first.accessUntil);
      const billing = await getBilling(user.id, now);
      assert.equal(billing.entitled, true);
      assert.equal(billing.source, "coupon");
      assert.equal(billing.couponAccessUntil, first.accessUntil);
      assert.equal((await activeCouponAccessUntil(user.id, now))?.toISOString(), first.accessUntil);
    });

    await t.test("30-day coupon can be limited to one account and rejects the next", async () => {
      const issued = await createCoupon({ code: "TRINTA-DIAS", durationDays: 30, maxRedemptions: 1 });
      const first = await redeemCoupon(other.id, issued.code, now);
      assert.equal(first.durationDays, 30);
      await assert.rejects(
        () => redeemCoupon(user.id, issued.code, now),
        (error: { code?: string }) => error.code === "INVALID_PARAMETER",
      );
      const [stored] = await db.select().from(couponCodesTable).where(eq(couponCodesTable.id, issued.id));
      assert.equal(stored?.redeemedCount, 1);
      assert.equal((await db.select().from(couponRedemptionsTable)).length, 2);
    });

    await t.test("subscription period is extended by coupon without changing Asaas row", async () => {
      const periodEnd = new Date(now.getTime() + 2 * 86_400_000);
      await db.insert(subscriptionsTable).values({ userId: payer.id, status: "active", currentPeriodEnd: periodEnd });
      const issued = await createCoupon({ code: "ESTENDE-30", durationDays: 30 });
      const result = await redeemCoupon(payer.id, issued.code, now);
      assert.equal(result.accessUntil, new Date(periodEnd.getTime() + 30 * 86_400_000).toISOString());
      const [subscription] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, payer.id));
      assert.equal(subscription?.currentPeriodEnd?.toISOString(), periodEnd.toISOString());
    });
  } finally {
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  }
});
