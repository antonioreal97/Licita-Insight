import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  db,
  subscriptionsTable,
  userWorkspacePreferencesTable,
  usersTable,
  workspaceMembersTable,
  workspaceProfilesTable,
  workspacesTable,
  type WorkspaceOnboardingStatus,
  type WorkspaceType,
} from "@workspace/db";
import { entitlementSource, type EntitlementSource } from "../billing/billing-access";
import { userHasBetaGrant } from "../billing/beta-grants";
import { activeCouponAccessUntil } from "../billing/coupons";
import {
  WorkspaceArchivedError,
  WorkspaceLimitReachedError,
  WorkspaceNotFoundError,
  WorkspaceReadOnlyError,
} from "../lib/api-error";
import type { GateTransaction } from "./cutover-gate";

/** `db` for reads; the gated transaction when the read decides a write. */
type Executor = Pick<typeof db, "select">;

export type WorkspaceAccessMode = "write" | "read_only";

export type WorkspaceMember = {
  workspaceId: string;
  type: WorkspaceType;
  role: "owner";
  ownerUserId: string;
  archivedAt: Date | null;
  accessMode: WorkspaceAccessMode;
};

export type WorkspaceSummary = {
  id: string;
  type: WorkspaceType;
  name: string;
  role: "owner";
  accessMode: WorkspaceAccessMode;
  onboardingStatus: WorkspaceOnboardingStatus;
  profileCompleteness: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const WORKSPACE_ID = /^ws_[0-9a-f]{32}$/;

export const isWorkspaceId = (value: string): boolean => WORKSPACE_ID.test(value);

/** Same id as the W3 backfill (`'ws_' || md5('pardal-digital:procurement:' || user_id)`), so a retry never forks it. */
export const defaultWorkspaceId = (userId: string): string =>
  `ws_${createHash("md5").update(`pardal-digital:procurement:${userId}`).digest("hex")}`;

/** Any current entitlement (subscription, trial, coupon, beta, dev) unlocks 5; without one the account keeps 1. */
export const workspaceLimit = (source: EntitlementSource): number => (source === null ? 1 : 5);

/**
 * The `limit` lowest slots among non-archived workspaces are writable; the rest are read-only. Archived ones never
 * take writes and do not hold a writable place, so archiving frees one and restoring puts the slot back in the order.
 */
export function workspaceAccessModes(
  workspaces: ReadonlyArray<{ id: string; limitSlot: number; archivedAt: Date | null }>,
  limit: number,
): Map<string, WorkspaceAccessMode> {
  const writable = new Set(
    workspaces
      .filter((workspace) => workspace.archivedAt === null)
      .sort((a, b) => a.limitSlot - b.limitSlot)
      .slice(0, limit)
      .map((workspace) => workspace.id),
  );
  return new Map(
    workspaces.map((workspace) => [workspace.id, writable.has(workspace.id) ? "write" : "read_only"]),
  );
}

/**
 * Keeps a valid preference (read-only still counts: it can be selected). Otherwise the most recently selected
 * writable non-archived workspace, then the oldest, then the lowest id; `null` sends the UI to "Explorar tudo".
 */
export function resolveActiveWorkspace(
  preferredId: string | null,
  workspaces: ReadonlyArray<{
    id: string;
    archivedAt: Date | null;
    accessMode: WorkspaceAccessMode;
    lastSelectedAt: Date | null;
    createdAt: Date;
  }>,
): string | null {
  if (workspaces.some((workspace) => workspace.id === preferredId && workspace.archivedAt === null)) {
    return preferredId;
  }
  const [first] = workspaces
    .filter((workspace) => workspace.archivedAt === null && workspace.accessMode === "write")
    .sort(
      (a, b) =>
        (b.lastSelectedAt?.getTime() ?? -Infinity) - (a.lastSelectedAt?.getTime() ?? -Infinity) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  return first?.id ?? null;
}

/** Same sources as `requireSubscription`, read through `executor` so a creation re-checks them inside its lock. */
export async function accountEntitlement(
  executor: Executor,
  userId: string,
  now: Date,
): Promise<EntitlementSource> {
  const [row] = await executor
    .select({
      status: subscriptionsTable.status,
      currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
      trialEndsAt: usersTable.trialEndsAt,
    })
    .from(usersTable)
    .leftJoin(subscriptionsTable, eq(subscriptionsTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);
  const source = entitlementSource(
    row ?? null,
    now,
    process.env,
    await activeCouponAccessUntil(userId, now, executor),
  );
  if (source !== null) return source;
  return (await userHasBetaGrant(userId, now, executor)) ? "beta" : null;
}

async function ownerAccessModes(
  executor: Executor,
  ownerUserId: string,
  now: Date,
): Promise<Map<string, WorkspaceAccessMode>> {
  const owned = await executor
    .select({ id: workspacesTable.id, limitSlot: workspacesTable.limitSlot, archivedAt: workspacesTable.archivedAt })
    .from(workspacesTable)
    .where(eq(workspacesTable.ownerUserId, ownerUserId));
  return workspaceAccessModes(owned, workspaceLimit(await accountEntitlement(executor, ownerUserId, now)));
}

/**
 * Membership comes from `workspace_members`, never from `owner_user_id` alone. A malformed id, a missing workspace
 * and someone else's workspace all raise the same 404. Callers still filter every later query by `workspace_id`.
 */
export async function requireWorkspaceMember(
  executor: Executor,
  userId: string,
  workspaceId: string,
  now = new Date(),
): Promise<WorkspaceMember> {
  if (!isWorkspaceId(workspaceId)) throw new WorkspaceNotFoundError();
  const [member] = await executor
    .select({
      type: workspacesTable.type,
      role: workspaceMembersTable.role,
      ownerUserId: workspacesTable.ownerUserId,
      archivedAt: workspacesTable.archivedAt,
    })
    .from(workspaceMembersTable)
    .innerJoin(workspacesTable, eq(workspacesTable.id, workspaceMembersTable.workspaceId))
    .where(and(eq(workspaceMembersTable.workspaceId, workspaceId), eq(workspaceMembersTable.userId, userId)))
    .limit(1);
  if (!member) throw new WorkspaceNotFoundError();
  const accessMode = (await ownerAccessModes(executor, member.ownerUserId, now)).get(workspaceId);
  if (!accessMode) throw new Error(`Workspace ${workspaceId} disappeared while computing its access mode`);
  return { workspaceId, ...member, accessMode };
}

/** Archived answers 409 before read-only answers 402, as in the isolation matrix of docs/contracts/workspaces-v1.md. */
export function assertWorkspaceWritable(member: WorkspaceMember): void {
  if (member.archivedAt !== null) throw new WorkspaceArchivedError();
  if (member.accessMode !== "write") throw new WorkspaceReadOnlyError();
}

/**
 * Owner membership in the same transaction, which must be the gated one. The per-owner lock serializes the slot and
 * the limit check, so concurrent requests or retries never share a slot or pass the limit together.
 */
export async function createWorkspace(
  tx: GateTransaction,
  input: { ownerUserId: string; type: WorkspaceType; name: string; isDefault?: boolean; now?: Date },
): Promise<WorkspaceSummary> {
  const now = input.now ?? new Date();
  const isDefault = input.isDefault ?? false;
  if (isDefault && input.type !== "procurement") {
    throw new Error(`The default workspace must be procurement, got ${input.type}`);
  }
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`licitai:workspace-owner:${input.ownerUserId}`}, 0))`,
  );
  const owned = await tx
    .select({ id: workspacesTable.id, limitSlot: workspacesTable.limitSlot, archivedAt: workspacesTable.archivedAt })
    .from(workspacesTable)
    .where(eq(workspacesTable.ownerUserId, input.ownerUserId));
  const maximum = workspaceLimit(await accountEntitlement(tx, input.ownerUserId, now));
  if (owned.filter((workspace) => workspace.archivedAt === null).length >= maximum) {
    throw new WorkspaceLimitReachedError(maximum);
  }
  const [workspace] = await tx
    .insert(workspacesTable)
    .values({
      id: isDefault ? defaultWorkspaceId(input.ownerUserId) : `ws_${randomBytes(16).toString("hex")}`,
      type: input.type,
      name: input.name,
      ownerUserId: input.ownerUserId,
      limitSlot: Math.max(0, ...owned.map((row) => row.limitSlot)) + 1,
      isDefault,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await tx.insert(workspaceMembersTable).values({
    workspaceId: workspace!.id,
    userId: input.ownerUserId,
    role: "owner",
    createdAt: now,
  });
  const accessMode = workspaceAccessModes([...owned, workspace!], maximum).get(workspace!.id)!;
  return {
    id: workspace!.id,
    type: workspace!.type,
    name: workspace!.name,
    role: "owner",
    accessMode,
    onboardingStatus: workspace!.onboardingStatus,
    profileCompleteness: 0,
    archivedAt: workspace!.archivedAt,
    createdAt: workspace!.createdAt,
    updatedAt: workspace!.updatedAt,
  };
}

/**
 * Lists the caller's owner memberships. An invalid stored preference is resolved for the answer and never written:
 * a GET does not change state. In Phase 1 every membership is the owner's, so the slots are the caller's.
 */
export async function listWorkspaces(
  executor: Executor,
  userId: string,
  options: { archived?: boolean; now?: Date } = {},
): Promise<{
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  limits: { used: number; maximum: number };
}> {
  const now = options.now ?? new Date();
  const rows = await executor
    .select({
      id: workspacesTable.id,
      type: workspacesTable.type,
      name: workspacesTable.name,
      limitSlot: workspacesTable.limitSlot,
      onboardingStatus: workspacesTable.onboardingStatus,
      profileCompleteness: workspaceProfilesTable.completenessPercent,
      archivedAt: workspacesTable.archivedAt,
      createdAt: workspacesTable.createdAt,
      updatedAt: workspacesTable.updatedAt,
      lastSelectedAt: workspaceMembersTable.lastSelectedAt,
    })
    .from(workspaceMembersTable)
    .innerJoin(workspacesTable, eq(workspacesTable.id, workspaceMembersTable.workspaceId))
    .leftJoin(workspaceProfilesTable, eq(workspaceProfilesTable.workspaceId, workspacesTable.id))
    .where(eq(workspaceMembersTable.userId, userId))
    .orderBy(asc(workspacesTable.limitSlot));
  const [preference] = await executor
    .select({ activeWorkspaceId: userWorkspacePreferencesTable.activeWorkspaceId })
    .from(userWorkspacePreferencesTable)
    .where(eq(userWorkspacePreferencesTable.userId, userId))
    .limit(1);
  const maximum = workspaceLimit(await accountEntitlement(executor, userId, now));
  const modes = workspaceAccessModes(rows, maximum);
  const all = rows.map((row) => ({ ...row, accessMode: modes.get(row.id)! }));
  return {
    workspaces: all
      .filter((row) => options.archived || row.archivedAt === null)
      .map(({ limitSlot: _slot, lastSelectedAt: _selected, profileCompleteness, ...row }) => ({
        ...row,
        role: "owner" as const,
        profileCompleteness: profileCompleteness ?? 0,
      })),
    activeWorkspaceId: resolveActiveWorkspace(preference?.activeWorkspaceId ?? null, all),
    limits: { used: all.filter((row) => row.archivedAt === null).length, maximum },
  };
}
