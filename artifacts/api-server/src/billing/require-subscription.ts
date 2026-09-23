import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, subscriptionsTable } from "@workspace/db";
import { authContext } from "../auth/http";
import { SubscriptionRequiredError } from "../lib/api-error";
import { isEntitled } from "./billing-access";

export const requireSubscription: RequestHandler = async (_req, res, next) => {
  try {
    const userId = authContext(res).user.id;
    const [row] = await db
      .select({
        status: subscriptionsTable.status,
        currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
      })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId))
      .limit(1);
    if (!isEntitled(row ?? null, new Date())) throw new SubscriptionRequiredError();
    next();
  } catch (error) {
    next(error);
  }
};
