import { and, count, eq, sql } from "drizzle-orm";
import { aiDailyTendersTable, db } from "@workspace/db";
import { AiQuotaExceededError } from "../lib/api-error";
import { dateInSaoPaulo } from "../lib/sao-paulo-date";
import { aiConfig } from "./config";
import { aiQuotaResetsAt } from "./policy";

/**
 * Daily AI quota, counted in processes: each tender with readable documents the user consults
 * (question or sheet) spends 1 the first time that day; later consultations of it are free.
 * `counted` says whether the tender at hand is already among today's.
 */
export type Quota = { used: number; limit: number; resetsAt: string; counted: boolean };

export const TENDER_QUOTA_DETAIL = { field: "quota", issue: "daily_tenders" } as const;

export async function tenderQuotaFor(userId: string, tenderId: string, now = new Date()): Promise<Quota> {
  const day = dateInSaoPaulo(now);
  const rows = await db
    .select({ tenderId: aiDailyTendersTable.tenderId })
    .from(aiDailyTendersTable)
    .where(and(eq(aiDailyTendersTable.userId, userId), eq(aiDailyTendersTable.quotaDay, day)));
  return {
    used: rows.length,
    limit: aiConfig().tenderDailyLimit,
    resetsAt: aiQuotaResetsAt(now),
    counted: rows.some((row) => row.tenderId === tenderId),
  };
}

/** Idempotent per user, day and tender; throws once the day's processes are used up. Call only when the tender has readable documents. */
export async function reserveTenderConsultation(userId: string, tenderId: string, now = new Date()): Promise<Quota> {
  const day = dateInSaoPaulo(now);
  const limit = aiConfig().tenderDailyLimit;
  const used = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai-tenders:${userId}:${day}`}))`);
    const where = and(eq(aiDailyTendersTable.userId, userId), eq(aiDailyTendersTable.quotaDay, day));
    const [already] = await tx
      .select({ tenderId: aiDailyTendersTable.tenderId })
      .from(aiDailyTendersTable)
      .where(and(where, eq(aiDailyTendersTable.tenderId, tenderId)))
      .limit(1);
    const [{ total }] = await tx.select({ total: count() }).from(aiDailyTendersTable).where(where);
    if (already) return total;
    if (total >= limit) {
      throw new AiQuotaExceededError("The daily limit of consulted tenders has been reached", [TENDER_QUOTA_DETAIL]);
    }
    await tx.insert(aiDailyTendersTable).values({ userId, quotaDay: day, tenderId, createdAt: now }).onConflictDoNothing();
    return total + 1;
  });
  return { used, limit, resetsAt: aiQuotaResetsAt(now), counted: true };
}
