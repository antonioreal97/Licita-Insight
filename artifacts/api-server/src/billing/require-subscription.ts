import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, subscriptionsTable, usersTable } from "@workspace/db";
import { authContext } from "../auth/http";
import { SubscriptionRequiredError } from "../lib/api-error";
import { isEntitled } from "./billing-access";
import { userHasBetaGrant } from "./beta-grants";
import { activeCouponAccessUntil } from "./coupons";

/** Active subscription, coupon, trial, beta grant or dev entitlement. */
export async function userHasActiveAccess(userId: string, now = new Date()): Promise<boolean> {
  if (isEntitled(null, now)) return true;
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
  return isEntitled(row ?? null, now, process.env, await activeCouponAccessUntil(userId, now)) || (await userHasBetaGrant(userId, now));
}

export const requireSubscription: RequestHandler = async (_req, res, next) => {
  try {
    if (isEntitled(null, new Date())) {
      next();
      return;
    }
    if (!(await userHasActiveAccess(authContext(res).user.id))) {
      throw new SubscriptionRequiredError();
    }
    next();
  } catch (error) {
    next(error);
  }
};
