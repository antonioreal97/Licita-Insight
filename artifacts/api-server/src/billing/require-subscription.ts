import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, subscriptionsTable, usersTable } from "@workspace/db";
import { authContext } from "../auth/http";
import { SubscriptionRequiredError } from "../lib/api-error";
import { isEntitled } from "./billing-access";

export const requireSubscription: RequestHandler = async (_req, res, next) => {
  try {
    if (isEntitled(null, new Date())) {
      next();
      return;
    }
    const userId = authContext(res).user.id;
    const [row] = await db
      .select({
        status: subscriptionsTable.status,
        currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
        trialEndsAt: usersTable.trialEndsAt,
      })
      .from(usersTable)
      .leftJoin(
        subscriptionsTable,
        eq(subscriptionsTable.userId, usersTable.id),
      )
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!isEntitled(row ?? null, new Date())) throw new SubscriptionRequiredError();
    next();
  } catch (error) {
    next(error);
  }
};
