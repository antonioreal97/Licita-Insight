import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { InvalidParameterError, NotFoundError } from "../lib/api-error";
import { verifyUnsubscribeToken } from "../email/unsubscribe-token";

export type EmailDigestPreference = "daily" | "off";
export type UnsubscribeScope = "all" | "digest" | "immediate";

export type NotificationPreferences = {
  email: {
    digest: EmailDigestPreference;
    immediateCritical: boolean;
  };
  emailAddress: string;
  updatedAt: Date | null;
};

const toPreferences = (
  row: Pick<
    typeof usersTable.$inferSelect,
    | "email"
    | "emailDigest"
    | "emailImmediateCritical"
    | "emailPreferencesUpdatedAt"
  >,
): NotificationPreferences => ({
  email: {
    digest: row.emailDigest as EmailDigestPreference,
    immediateCritical: row.emailImmediateCritical,
  },
  emailAddress: row.email,
  updatedAt: row.emailPreferencesUpdatedAt,
});

const selectPreferences = async (userId: string) => {
  const [row] = await db
    .select({
      email: usersTable.email,
      emailDigest: usersTable.emailDigest,
      emailImmediateCritical: usersTable.emailImmediateCritical,
      emailPreferencesUpdatedAt: usersTable.emailPreferencesUpdatedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!row) throw new NotFoundError("Account was not found");
  return row;
};

export const getNotificationPreferences = async (
  userId: string,
): Promise<NotificationPreferences> => toPreferences(await selectPreferences(userId));

export const updateNotificationPreferences = async (input: {
  userId: string;
  digest?: EmailDigestPreference;
  immediateCritical?: boolean;
  now?: Date;
}): Promise<NotificationPreferences> => {
  const now = input.now ?? new Date();
  const [row] = await db
    .update(usersTable)
    .set({
      ...(input.digest !== undefined ? { emailDigest: input.digest } : {}),
      ...(input.immediateCritical !== undefined
        ? { emailImmediateCritical: input.immediateCritical }
        : {}),
      emailPreferencesUpdatedAt: now,
      updatedAt: now,
    })
    .where(eq(usersTable.id, input.userId))
    .returning({
      email: usersTable.email,
      emailDigest: usersTable.emailDigest,
      emailImmediateCritical: usersTable.emailImmediateCritical,
      emailPreferencesUpdatedAt: usersTable.emailPreferencesUpdatedAt,
    });
  if (!row) throw new NotFoundError("Account was not found");
  return toPreferences(row);
};

export const unsubscribeEmail = async (input: {
  token: string;
  scope: UnsubscribeScope;
  now?: Date;
}): Promise<{ scope: UnsubscribeScope; email: NotificationPreferences["email"] }> => {
  const tokenId = verifyUnsubscribeToken(input.token);
  if (!tokenId) {
    throw new InvalidParameterError("Unsubscribe token is invalid", [
      { field: "token", issue: "invalid_value" },
    ]);
  }
  const now = input.now ?? new Date();
  const [row] = await db
    .update(usersTable)
    .set({
      ...(input.scope === "all" || input.scope === "digest"
        ? { emailDigest: "off" }
        : {}),
      ...(input.scope === "all" || input.scope === "immediate"
        ? { emailImmediateCritical: false }
        : {}),
      emailPreferencesUpdatedAt: now,
      updatedAt: now,
    })
    .where(eq(usersTable.emailUnsubscribeId, tokenId))
    .returning({
      emailDigest: usersTable.emailDigest,
      emailImmediateCritical: usersTable.emailImmediateCritical,
    });
  if (!row) {
    throw new InvalidParameterError("Unsubscribe token is invalid", [
      { field: "token", issue: "invalid_value" },
    ]);
  }
  return {
    scope: input.scope,
    email: {
      digest: row.emailDigest as EmailDigestPreference,
      immediateCritical: row.emailImmediateCritical,
    },
  };
};
