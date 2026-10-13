import { randomUUID } from "node:crypto";
import { and, eq, getTableColumns, gt, isNull, sql } from "drizzle-orm";
import {
  db,
  googleTrialTombstonesTable,
  sessionsTable,
  usersTable,
  type WorkspaceCutoverMode,
} from "@workspace/db";
import type { User } from "@workspace/api-zod";
import { googleTrialSubjectHash, trialEndsAtFrom } from "../billing/trial-access";
import { sessionSecret } from "./config";
import { randomToken, sha256, type GoogleIdentity } from "./tokens";
import { withCutoverGate, type GateDatabase } from "../workspaces/cutover-gate";
import { createAccountDefaultWorkspace } from "../workspaces/workspace-service";

export const SESSION_IDLE_MS = 10 * 60 * 1000;
const SESSION_TOUCH_AFTER_MS = 60 * 1000;

/** Extends the session by one idle window, at most once a minute. */
export const renewedExpiry = (lastSeenAt: Date, now: Date): Date | null => {
  if (now.getTime() - lastSeenAt.getTime() < SESSION_TOUCH_AFTER_MS) return null;
  return new Date(now.getTime() + SESSION_IDLE_MS);
};

type UserRow = typeof usersTable.$inferSelect;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AuthSession = { token: string; expiresAt: Date };
export type AuthContext = { user: User; sessionId: string };

export const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  name: row.name,
  avatarUrl: row.avatarUrl,
  createdAt: row.createdAt,
});

/**
 * Signs a known account in. An unknown one is created only when `createIn` says in which model, and in `workspaces`
 * it is born with its default workspace; otherwise the answer is `null`.
 */
const signInGoogleUser = async (
  tx: Transaction,
  identity: GoogleIdentity,
  now: Date,
  trialSecret: string,
  createIn: WorkspaceCutoverMode | null,
): Promise<User | null> => {
  const subjectHash = googleTrialSubjectHash(identity.sub, trialSecret);
  const [bySub] = await tx
    .select()
    .from(usersTable)
    .where(eq(usersTable.googleSub, identity.sub))
    .limit(1);
  if (bySub) {
    await ensureGoogleTrialTombstone(tx, subjectHash, bySub.trialEndsAt);
    const [updated] = await tx
      .update(usersTable)
      .set({
        email: identity.email,
        name: identity.name,
        avatarUrl: identity.picture,
        updatedAt: now,
      })
      .where(eq(usersTable.id, bySub.id))
      .returning();
    return toUser(updated ?? bySub);
  }

  const [byEmail] = await tx
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, identity.email))
    .limit(1);
  if (byEmail) {
    const trialEndsAt = await ensureGoogleTrialTombstone(
      tx,
      subjectHash,
      byEmail.trialEndsAt,
    );
    const [updated] = await tx
      .update(usersTable)
      .set({
        googleSub: identity.sub,
        name: identity.name,
        avatarUrl: identity.picture,
        trialEndsAt,
        updatedAt: now,
      })
      .where(and(eq(usersTable.id, byEmail.id), isNull(usersTable.googleSub)))
      .returning();
    if (!updated) throw new Error("Email belongs to another Google identity");
    return toUser(updated);
  }

  if (createIn === null) return null;
  const trialEndsAt = await ensureGoogleTrialTombstone(
    tx,
    subjectHash,
    trialEndsAtFrom(now),
  );
  const [created] = await tx
    .insert(usersTable)
    .values({
      id: randomUUID(),
      googleSub: identity.sub,
      email: identity.email,
      name: identity.name,
      avatarUrl: identity.picture,
      trialEndsAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!created) throw new Error("Failed to create Google user");
  if (createIn === "workspaces") await createAccountDefaultWorkspace(tx, created.id, now);
  return toUser(created);
};

/**
 * A returning account is not a write of the cutover scope: it keeps signing in while the cutover pauses writes.
 * Creating an account is, in any mode, so only that goes through the gate (and answers 503 during the pause).
 */
export const upsertGoogleUser = async (
  identity: GoogleIdentity,
  now = new Date(),
  trialSecret = sessionSecret(),
  database: GateDatabase = db,
): Promise<User> =>
  (await database.transaction((tx) => signInGoogleUser(tx, identity, now, trialSecret, null))) ??
  (await withCutoverGate(
    { kind: "http" },
    // The account may have been created since the first look: inside the gate that is a plain sign-in again.
    async (tx, state) => (await signInGoogleUser(tx, identity, now, trialSecret, state.mode))!,
    database,
  ));

const ensureGoogleTrialTombstone = async (
  tx: Transaction,
  subjectHash: string,
  proposedTrialEndsAt: Date,
): Promise<Date> => {
  const [inserted] = await tx
    .insert(googleTrialTombstonesTable)
    .values({ subjectHash, trialEndsAt: proposedTrialEndsAt })
    .onConflictDoNothing()
    .returning({ trialEndsAt: googleTrialTombstonesTable.trialEndsAt });
  if (inserted) return inserted.trialEndsAt;

  const [existing] = await tx
    .select({ trialEndsAt: googleTrialTombstonesTable.trialEndsAt })
    .from(googleTrialTombstonesTable)
    .where(eq(googleTrialTombstonesTable.subjectHash, subjectHash))
    .limit(1);
  if (!existing) throw new Error("Failed to persist Google trial identity");
  return existing.trialEndsAt;
};

/** Same split as `upsertGoogleUser`: a known e-mail is updated outside the gate, a new account is created through it. */
export const upsertDevUser = async (
  input: { email: string; name: string | null },
  now = new Date(),
  database: GateDatabase = db,
): Promise<User> => {
  const email = input.email.trim().toLowerCase();
  const [known] = await database.transaction((tx) =>
    tx
      .update(usersTable)
      .set({ name: input.name, updatedAt: now })
      .where(eq(usersTable.email, email))
      .returning(),
  );
  if (known) return toUser(known);
  return withCutoverGate(
    { kind: "http" },
    async (tx, state) => {
      const [row] = await tx
        .insert(usersTable)
        .values({
          id: randomUUID(),
          email,
          name: input.name,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: usersTable.email,
          set: { name: input.name, updatedAt: now },
        })
        // `xmax = 0` only on a row this statement inserted: a concurrent first login already created the account.
        .returning({ ...getTableColumns(usersTable), inserted: sql<boolean>`(xmax = 0)` });
      if (!row) throw new Error("Failed to create development user");
      if (row.inserted && state.mode === "workspaces") await createAccountDefaultWorkspace(tx, row.id, now);
      return toUser(row);
    },
    database,
  );
};

export const createSession = async (
  userId: string,
  now = new Date(),
): Promise<AuthSession> => {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_IDLE_MS);
  await db.insert(sessionsTable).values({
    id: sha256(token),
    userId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
  });
  return { token, expiresAt };
};

export const readSession = async (
  token: string | undefined,
  now = new Date(),
): Promise<{ context: AuthContext; renewedUntil: Date | null } | null> => {
  if (!token) return null;
  const sessionId = sha256(token);
  const [row] = await db
    .select({ session: sessionsTable, user: usersTable })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(
      and(
        eq(sessionsTable.id, sessionId),
        isNull(sessionsTable.revokedAt),
        gt(sessionsTable.expiresAt, now),
      ),
    )
    .limit(1);
  if (!row) return null;

  if (now.getTime() - row.session.lastSeenAt.getTime() >= SESSION_IDLE_MS) {
    await db
      .update(sessionsTable)
      .set({ revokedAt: now })
      .where(and(eq(sessionsTable.id, sessionId), isNull(sessionsTable.revokedAt)));
    return null;
  }

  const renewedUntil = renewedExpiry(row.session.lastSeenAt, now);
  if (renewedUntil) {
    await db
      .update(sessionsTable)
      .set({ lastSeenAt: now, expiresAt: renewedUntil })
      .where(eq(sessionsTable.id, sessionId));
  }

  return {
    context: { user: toUser(row.user), sessionId },
    renewedUntil,
  };
};

export const revokeSession = async (
  token: string | undefined,
  now = new Date(),
): Promise<void> => {
  if (!token) return;
  await db
    .update(sessionsTable)
    .set({ revokedAt: now })
    .where(and(eq(sessionsTable.id, sha256(token)), isNull(sessionsTable.revokedAt)));
};
