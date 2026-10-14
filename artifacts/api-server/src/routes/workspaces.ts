import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  userWorkspacePreferencesTable,
  workspaceMembersTable,
  workspaceProfilesTable,
  workspacesTable,
  type WorkspaceType,
} from "@workspace/db";
import {
  WORKSPACE_PROFILE_SCHEMA_VERSION,
  WorkspaceProfileSchema,
  workspaceProfileCompleteness,
} from "@workspace/api-zod/hub";
import {
  asyncHandler,
  authContext,
  requireAuth,
  requireCsrf,
} from "../auth/http";
import {
  InvalidParameterError,
  WorkspaceArchivedError,
  WorkspaceNotFoundError,
} from "../lib/api-error";
import { withCutoverGate } from "../workspaces/cutover-gate";
import { saveWorkspaceProfileStep } from "../workspaces/workspace-profile-service";
import {
  assertWorkspaceRouteEnabled,
  assertWorkspaceWriteEnabled,
} from "../workspaces/workspace-route-gate";
import {
  assertWorkspaceWritable,
  createWorkspace,
  isWorkspaceId,
  listWorkspaces,
  requireWorkspaceMember,
  type WorkspaceMember,
} from "../workspaces/workspace-service";

const router: IRouter = Router();
const base = "/v1/me/workspaces";
const invalid = (field: string, issue = "invalid_value"): never => {
  throw new InvalidParameterError(`${field} is invalid`, [{ field, issue }]);
};
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid("body", "invalid_type");
const only = (body: Record<string, unknown>, keys: string[]): void => {
  for (const key of Object.keys(body))
    if (!keys.includes(key)) invalid(key, "not_allowed");
};
const id = (value: unknown): string =>
  typeof value === "string" && isWorkspaceId(value)
    ? value
    : invalid("workspaceId");
const text = (value: unknown, field: string, max = 120): string => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    invalid(field);
  return (value as string).trim();
};
const noStore = (
  _req: unknown,
  res: { setHeader(name: string, value: string): void },
  next: () => void,
) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};

export function parseWorkspaceCreate(body: unknown): {
  type: WorkspaceType;
  name: string;
} {
  const value = object(body);
  only(value, ["type", "name"]);
  if (
    value.type !== "procurement" &&
    value.type !== "funding" &&
    value.type !== "culture" &&
    value.type !== "study"
  )
    invalid("type", "invalid_enum");
  return { type: value.type as WorkspaceType, name: text(value.name, "name") };
}

export function parseWorkspacePatch(body: unknown): {
  name?: string;
  archived?: boolean;
} {
  const value = object(body);
  only(value, ["name", "archived"]);
  if (value.name === undefined && value.archived === undefined)
    invalid("body", "too_small");
  if (value.archived !== undefined && typeof value.archived !== "boolean")
    invalid("archived", "invalid_type");
  return {
    ...(value.name !== undefined ? { name: text(value.name, "name") } : {}),
    ...(value.archived !== undefined
      ? { archived: value.archived as boolean }
      : {}),
  };
}

export function parseActiveWorkspace(body: unknown): string {
  const value = object(body);
  only(value, ["workspaceId"]);
  return id(value.workspaceId);
}

const user = (res: Parameters<typeof authContext>[0]) =>
  authContext(res).user.id;
const member = async (
  userId: string,
  workspaceId: unknown,
  executor: Pick<typeof db, "select"> = db,
): Promise<WorkspaceMember> =>
  requireWorkspaceMember(executor, userId, id(workspaceId));
const ensureJourney = (member: WorkspaceMember) =>
  assertWorkspaceRouteEnabled(member.type);

router.use(base, requireAuth, noStore);
router.use("/v1/me/active-workspace", requireAuth, noStore);

router.get(
  base,
  asyncHandler(async (req, res) => {
    await assertWorkspaceRouteEnabled();
    const archived = req.query.archived;
    if (archived !== undefined && archived !== "true" && archived !== "false")
      invalid("archived");
    res.json(
      await listWorkspaces(db, user(res), { archived: archived === "true" }),
    );
  }),
);

router.post(
  base,
  requireCsrf,
  asyncHandler(async (req, res) => {
    await assertWorkspaceRouteEnabled();
    const input = parseWorkspaceCreate(req.body);
    await assertWorkspaceRouteEnabled(input.type);
    const created = await withCutoverGate(
      { kind: "http" },
      async (tx, state) => {
        assertWorkspaceWriteEnabled(state.mode, input.type);
        return createWorkspace(tx, { ownerUserId: user(res), ...input });
      },
    );
    res.status(201).json(created);
  }),
);

router.get(
  `${base}/:id`,
  asyncHandler(async (req, res) => {
    await assertWorkspaceRouteEnabled();
    const own = await member(user(res), req.params.id);
    await ensureJourney(own);
    const listed = await listWorkspaces(db, user(res), { archived: true });
    const workspace = listed.workspaces.find(
      (row) => row.id === own.workspaceId,
    );
    if (!workspace) throw new WorkspaceNotFoundError();
    const [stored] = await db
      .select()
      .from(workspaceProfilesTable)
      .where(eq(workspaceProfilesTable.workspaceId, own.workspaceId))
      .limit(1);
    const profile = WorkspaceProfileSchema.parse({
      schemaVersion: stored?.schemaVersion ?? WORKSPACE_PROFILE_SCHEMA_VERSION,
      type: own.type,
      answers: stored?.answers ?? {},
    });
    res.json({
      workspace,
      profile: {
        ...profile,
        completeness: workspaceProfileCompleteness(profile),
        profileVersion: stored?.profileVersion ?? 0,
        revision: stored?.revision ?? 0,
      },
    });
  }),
);

router.patch(
  `${base}/:id`,
  requireCsrf,
  asyncHandler(async (req, res) => {
    await assertWorkspaceRouteEnabled();
    const patch = parseWorkspacePatch(req.body);
    const workspace = await withCutoverGate(
      { kind: "http" },
      async (tx, state) => {
        const own = await member(user(res), req.params.id, tx);
        assertWorkspaceWriteEnabled(state.mode, own.type);
        // Restoring is the one allowed transition out of archived. It does not
        // grant write access; the slot is recalculated after the change.
        if (!(
          own.archivedAt &&
          patch.archived === false &&
          patch.name === undefined
        )) {
          assertWorkspaceWritable(own);
        }
        const [updated] = await tx
          .update(workspacesTable)
          .set({
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.archived === true
              ? { archivedAt: new Date() }
              : patch.archived === false
                ? { archivedAt: null }
                : {}),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(workspacesTable.id, own.workspaceId),
              eq(workspacesTable.ownerUserId, user(res)),
            ),
          )
          .returning();
        if (!updated) throw new WorkspaceNotFoundError();
        const listed = await listWorkspaces(tx, user(res), { archived: true });
        if (patch.archived === true) {
          const [preference] = await tx
            .select()
            .from(userWorkspacePreferencesTable)
            .where(eq(userWorkspacePreferencesTable.userId, user(res)))
            .limit(1);
          if (preference?.activeWorkspaceId === own.workspaceId) {
            await tx
              .update(userWorkspacePreferencesTable)
              .set({
                activeWorkspaceId: listed.activeWorkspaceId,
                updatedAt: new Date(),
              })
              .where(eq(userWorkspacePreferencesTable.userId, user(res)));
          }
        }
        return listed.workspaces.find((row) => row.id === updated.id)!;
      },
    );
    res.json(workspace);
  }),
);

router.put(
  `${base}/:id/profile`,
  requireCsrf,
  asyncHandler(async (req, res) => {
    await assertWorkspaceRouteEnabled();
    const saved = await withCutoverGate({ kind: "http" }, async (tx, state) => {
      const own = await member(user(res), req.params.id, tx);
      assertWorkspaceWriteEnabled(state.mode, own.type);
      return saveWorkspaceProfileStep(tx, own, req.body);
    });
    res.json(saved);
  }),
);

router.put(
  "/v1/me/active-workspace",
  requireCsrf,
  asyncHandler(async (req, res) => {
    await assertWorkspaceRouteEnabled();
    const workspaceId = parseActiveWorkspace(req.body);
    const activeWorkspaceId = await withCutoverGate(
      { kind: "http" },
      async (tx, state) => {
        const own = await member(user(res), workspaceId, tx);
        assertWorkspaceWriteEnabled(state.mode, own.type);
        if (own.archivedAt) throw new WorkspaceArchivedError();
        const now = new Date();
        await tx
          .update(workspaceMembersTable)
          .set({ lastSelectedAt: now })
          .where(
            and(
              eq(workspaceMembersTable.workspaceId, workspaceId),
              eq(workspaceMembersTable.userId, user(res)),
            ),
          );
        await tx
          .insert(userWorkspacePreferencesTable)
          .values({
            userId: user(res),
            activeWorkspaceId: workspaceId,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: userWorkspacePreferencesTable.userId,
            set: { activeWorkspaceId: workspaceId, updatedAt: now },
          });
        return workspaceId;
      },
    );
    res.json({ activeWorkspaceId });
  }),
);

export default router;
