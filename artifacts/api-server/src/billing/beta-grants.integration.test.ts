import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const runner = path.join(repoRoot, "lib/db/scripts/beta-access.mjs");

// Opt-in: uses real Postgres in an isolated schema, like account.integration.test.ts.
test("closed-beta grants with PostgreSQL", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  const schema = `beta_grant_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  delete process.env.BILLING_DEV_ENTITLED;

  const { db, pool, betaAccessGrantsTable, subscriptionsTable, usersTable } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const { activeBetaGrantEmails, userHasBetaGrant } = await import("./beta-grants");
  const { applyAsaasWebhook, getBilling } = await import("./billing-service");
  const { requireSubscription } = await import("./require-subscription");
  const { hasEmailAccess } = await import("../email/email-service");
  const { SubscriptionRequiredError } = await import("../lib/api-error");

  await pool.query(`CREATE SCHEMA "${schema}"`);
  for (const table of ["users", "subscriptions"]) {
    await pool.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
  }
  // The table comes from the versioned migration itself, not from public, so this proves 0018.
  await pool.query(readFileSync(path.join(repoRoot, "lib/db/migrations/0018_beta_access.sql"), "utf8"));

  const now = new Date();
  const past = new Date(now.getTime() - 86_400_000);
  const future = new Date(now.getTime() + 30 * 86_400_000);
  // Google may return a mixed-case address; grants are always stored lowercase.
  const guest = { id: "user-beta-guest", email: "Convidado@Example.com" };
  const payer = { id: "user-beta-payer", email: "pagante@example.com" };
  await db.insert(usersTable).values([
    { id: guest.id, email: guest.email, trialEndsAt: past },
    { id: payer.id, email: payer.email, trialEndsAt: past },
  ]);

  const grant = (email: string, accessUntil: Date, revokedAt: Date | null = null) =>
    db
      .insert(betaAccessGrantsTable)
      .values({ email, accessUntil, revokedAt })
      .onConflictDoUpdate({ target: betaAccessGrantsTable.email, set: { accessUntil, revokedAt } });

  const gate = async (userId: string): Promise<unknown> => {
    let received: unknown = "not-called";
    const res = { locals: { auth: { user: { id: userId } } } };
    await requireSubscription({} as never, res as never, (error?: unknown) => {
      received = error;
    });
    return received;
  };

  const emailCandidate = (email: string) => ({
    type: "document_added",
    email,
    subscriptionStatus: null,
    currentPeriodEnd: null,
    trialEndsAt: past,
  });

  try {
    await t.test("no grant: trial over, no subscription, no access anywhere", async () => {
      assert.equal(await userHasBetaGrant(guest.id, now), false);
      const billing = await getBilling(guest.id);
      assert.equal(billing.entitled, false);
      assert.equal(billing.source, null);
      assert.ok((await gate(guest.id)) instanceof SubscriptionRequiredError);
      assert.equal(hasEmailAccess(emailCandidate(guest.email) as never, now, await activeBetaGrantEmails(now)), false);
    });

    await t.test("the table refuses a mixed-case email, so the key is case-insensitive", async () => {
      await assert.rejects(
        grant("Convidado@Example.COM", future),
        (error: { cause?: { constraint?: string } }) =>
          error.cause?.constraint === "beta_access_grants_email_lowercase_check",
      );
    });

    await t.test("active grant vs mixed-case user email: gate, /me/billing and e-mail all honor it", async () => {
      await grant("convidado@example.com", future);
      assert.equal(await userHasBetaGrant(guest.id, now), true);
      const billing = await getBilling(guest.id);
      assert.equal(billing.entitled, true);
      assert.equal(billing.source, "beta");
      assert.equal(await gate(guest.id), undefined);
      const betaEmails = await activeBetaGrantEmails(now);
      assert.deepEqual([...betaEmails], ["convidado@example.com"]);
      assert.equal(hasEmailAccess(emailCandidate("CONVIDADO@example.com") as never, now, betaEmails), true);
    });

    await t.test("expired grant: 402 again", async () => {
      await grant("convidado@example.com", past);
      assert.equal(await userHasBetaGrant(guest.id, now), false);
      assert.equal((await getBilling(guest.id)).entitled, false);
      assert.ok((await gate(guest.id)) instanceof SubscriptionRequiredError);
      assert.equal((await activeBetaGrantEmails(now)).size, 0);
    });

    await t.test("revoked grant is not honored even before access_until", async () => {
      await grant("convidado@example.com", future, now);
      assert.equal(await userHasBetaGrant(guest.id, now), false);
      assert.ok((await gate(guest.id)) instanceof SubscriptionRequiredError);
    });

    await t.test("a paying user keeps source subscription even with a grant", async () => {
      await db.insert(subscriptionsTable).values({ userId: payer.id, status: "active", asaasSubscriptionId: "sub_beta_test" });
      await grant(payer.email, future);
      const billing = await getBilling(payer.id);
      assert.equal(billing.source, "subscription");
      assert.equal(await gate(payer.id), undefined);
    });

    await t.test("an Asaas webhook for the user never modifies the grant", async () => {
      const [before] = await db.select().from(betaAccessGrantsTable).where(eq(betaAccessGrantsTable.email, payer.email));
      await applyAsaasWebhook({
        event: "PAYMENT_REFUNDED",
        payment: { id: "pay_beta_test", externalReference: payer.id, subscription: "sub_beta_test", status: "REFUNDED" },
      });
      const [after] = await db.select().from(betaAccessGrantsTable).where(eq(betaAccessGrantsTable.email, payer.email));
      assert.deepEqual(after, before);
      // The webhook really ran: the refund canceled the subscription...
      const [subscription] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, payer.id));
      assert.equal(subscription?.status, "canceled");
      // ...and access now comes from the untouched grant.
      const billing = await getBilling(payer.id);
      assert.equal(billing.source, "beta");
      assert.equal(await gate(payer.id), undefined);
    });

    await t.test("in-image runner: grant, list, revoke; refuses without DATABASE_URL", () => {
      const run = (args: string[], env: NodeJS.ProcessEnv) =>
        spawnSync(process.execPath, [runner, ...args], { env, encoding: "utf8" });
      const withDb = { PATH: process.env.PATH, DATABASE_URL: process.env.DATABASE_URL };

      const granted = run(["grant", "Novo@Example.com", future.toISOString()], withDb);
      assert.equal(granted.status, 0, granted.stderr);
      assert.match(granted.stdout, /granted novo@example\.com/);

      const listed = run(["list"], withDb);
      assert.equal(listed.status, 0, listed.stderr);
      assert.match(listed.stdout, /novo@example\.com\t.+\tactive/);

      const revoked = run(["revoke", "NOVO@example.com"], withDb);
      assert.equal(revoked.status, 0, revoked.stderr);
      assert.match(run(["list"], withDb).stdout, /novo@example\.com\t.+\trevoked/);

      const refused = run(["list"], { PATH: process.env.PATH });
      assert.notEqual(refused.status, 0);
      assert.match(refused.stderr, /DATABASE_URL is required explicitly/);
    });
  } finally {
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  }
});
