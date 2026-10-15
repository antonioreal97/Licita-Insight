import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db, tendersTable } from "@workspace/db";
import type { OpenTendersStateRow } from "../services/open-tenders-by-state";

/**
 * One grouped read, answered from the partial index `tenders_open_by_state_value_idx`. Every open tender is
 * counted; a value flagged as implausible stays out of the sum.
 */
export const selectOpenTendersByState = (): Promise<OpenTendersStateRow[]> =>
  db
    .select({
      state: sql<string>`${tendersTable.state}`,
      openTenders: sql<number>`count(*)::int`,
      estimatedValueTotal: sql<number | null>`(sum(${tendersTable.estimatedValue}) filter (where ${tendersTable.estimatedValueFlag} is null))::float8`,
      updatedAt: sql<Date | null>`max(${tendersTable.fetchedAt})`.mapWith(tendersTable.fetchedAt),
    })
    .from(tendersTable)
    .where(and(eq(tendersTable.status, "open"), isNotNull(tendersTable.state)))
    .groupBy(tendersTable.state);
