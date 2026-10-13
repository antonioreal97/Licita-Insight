import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { betaAccessGrantsTable, db, usersTable } from "@workspace/db";

/**
 * Closed-beta access granted by the owner (lib/db/scripts/beta-access.mjs), deliberately
 * outside `subscriptions` so an Asaas webhook or cancellation can never erase or extend it.
 * Emails compare case-insensitively on both sides.
 */
const activeGrant = (now: Date) =>
  and(isNull(betaAccessGrantsTable.revokedAt), gt(betaAccessGrantsTable.accessUntil, now));

export async function userHasBetaGrant(
  userId: string,
  now: Date,
  executor: Pick<typeof db, "select"> = db,
): Promise<boolean> {
  const [row] = await executor
    .select({ email: betaAccessGrantsTable.email })
    .from(betaAccessGrantsTable)
    .innerJoin(usersTable, sql`lower(${usersTable.email}) = lower(${betaAccessGrantsTable.email})`)
    .where(and(eq(usersTable.id, userId), activeGrant(now)))
    .limit(1);
  return row !== undefined;
}

/** One query per email job run instead of one per candidate. */
export async function activeBetaGrantEmails(now: Date): Promise<Set<string>> {
  const rows = await db
    .select({ email: sql<string>`lower(${betaAccessGrantsTable.email})` })
    .from(betaAccessGrantsTable)
    .where(activeGrant(now));
  return new Set(rows.map((row) => row.email));
}
