import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { AccountUsageProfileInputSchema } from "@workspace/api-zod/hub";
import { InvalidParameterError, NotFoundError } from "../lib/api-error";
import { scheduleRecommendationRebuild } from "../recommendations/recommendation-service";

const fields = {
  usagePurposes: usersTable.usagePurposes,
  applicantTypes: usersTable.applicantTypes,
  usageInviteDismissed: usersTable.usageInviteDismissed,
};

export async function getUsageProfile(userId: string) {
  const [row] = await db.select(fields).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!row) throw new NotFoundError("Account was not found");
  return row;
}

export async function updateUsageProfile(userId: string, body: unknown) {
  const parsed = AccountUsageProfileInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new InvalidParameterError("Usage profile is invalid", parsed.error.issues.map((issue) => ({
      field: issue.path.join(".") || "body",
      issue: issue.code,
    })));
  }
  const [row] = await db.update(usersTable).set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(usersTable.id, userId)).returning(fields);
  if (!row) throw new NotFoundError("Account was not found");
  if (parsed.data.usagePurposes !== undefined || parsed.data.applicantTypes !== undefined) scheduleRecommendationRebuild(userId, 0);
  return row;
}
