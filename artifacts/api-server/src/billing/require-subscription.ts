import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, subscriptionsTable, usersTable } from "@workspace/db";
import { authContext } from "../auth/http";
import { SubscriptionRequiredError } from "../lib/api-error";
import { isEntitled } from "./billing-access";
import { userHasBetaGrant } from "./beta-grants";
import { activeCouponAccessUntil } from "./coupons";

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
    const now = new Date();
    if (!isEntitled(row ?? null, now, process.env, await activeCouponAccessUntil(userId, now)) && !(await userHasBetaGrant(userId, now))) {
      throw new SubscriptionRequiredError();
    }
    next();
  } catch (error) {
    next(error);
  }
};
