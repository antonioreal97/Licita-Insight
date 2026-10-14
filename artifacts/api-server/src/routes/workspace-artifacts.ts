import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import {
  db,
  notificationsTable,
  savedSearchesTable,
  savedTendersTable,
  tendersTable,
  userRecommendationsTable,
} from "@workspace/db";
import {
  asyncHandler,
  authContext,
  requireAuth,
  requireCsrf,
} from "../auth/http";
import { canonicalSearchQuery } from "../account/saved-search-query";
import { toNotification } from "../account/account-service";
import {
  ConflictError,
  FeatureDisabledError,
  InvalidParameterError,
  SubscriptionRequiredError,
  WorkspaceNotFoundError,
} from "../lib/api-error";
import { tenderRowToDetail } from "../repositories/postgres-tender-repository";
import { withCutoverGate } from "../workspaces/cutover-gate";
import {
  assertWorkspaceRouteEnabled,
  assertWorkspaceWriteEnabled,
} from "../workspaces/workspace-route-gate";
import {
  accountEntitlement,
  assertWorkspaceWritable,
  requireWorkspaceMember,
  type WorkspaceMember,
} from "../workspaces/workspace-service";

const router: IRouter = Router();
const base = "/v1/me/workspaces/:id";
const invalid = (field: string, issue = "invalid_value"): never => {
  throw new InvalidParameterError(`${field} is invalid`, [{ field, issue }]);
};
const body = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid("body", "invalid_type");
const page = (
  value: unknown,
  field: string,
  fallback: number,
  max: number,
): number => {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > max)
    invalid(field, "out_of_range");
  return number;
};
const string = (
  value: unknown,
  field: string,
  max: number,
  min = 1,
): string => {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    invalid(field);
  return (value as string).trim();
};
const pagination = (p: number, size: number, total: number) => ({
  page: p,
  pageSize: size,
  total,
  totalPages: Math.ceil(total / size),
  totalIsEstimate: false,
});
const own = async (
  res: Parameters<typeof authContext>[0],
  workspaceId: string,
  executor: Pick<typeof db, "select"> = db,
): Promise<WorkspaceMember> =>
  requireWorkspaceMember(executor, authContext(res).user.id, workspaceId);
const premium = async (userId: string): Promise<void> => {
  if ((await accountEntitlement(db, userId, new Date())) === null)
    throw new SubscriptionRequiredError();
};
const searchJson = (row: typeof savedSearchesTable.$inferSelect) => ({
  id: row.id,
  name: row.name,
  query: row.query,
  alertsEnabled: row.alertsEnabled,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  lastCheckedAt: row.lastCheckedAt,
  newMatchesCount: row.newMatchesCount,
});
const searchFilter = (workspaceId: string, userId: string) =>
  and(
    eq(savedSearchesTable.workspaceId, workspaceId),
    eq(savedSearchesTable.userId, userId),
    isNull(savedSearchesTable.deletedAt),
  );

router.use(base, requireAuth, (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
router.use(
  base,
  asyncHandler(async (req, res, next) => {
    await assertWorkspaceRouteEnabled();
    const member = await own(res, String(req.params.id));
    await assertWorkspaceRouteEnabled(member.type);
    res.locals.workspaceMember = member;
    next();
  }),
);
const current = (res: { locals: Record<string, unknown> }): WorkspaceMember =>
  res.locals.workspaceMember as WorkspaceMember;

// Storage for saved cultural/funding opportunities is not part of W1/W2. Keep
// these contract paths mounted while their own artifact remains unavailable.
router.get(`${base}/saved-opportunities`, (_req, _res, next) =>
  next(new FeatureDisabledError()),
);
router.put(
  `${base}/saved-opportunities/:opportunityId`,
  requireCsrf,
  (_req, _res, next) => next(new FeatureDisabledError()),
);
router.delete(
  `${base}/saved-opportunities/:opportunityId`,
  requireCsrf,
  (_req, _res, next) => next(new FeatureDisabledError()),
);

router.get(
  `${base}/saved-searches`,
  asyncHandler(async (_req, res) => {
    const member = current(res);
    await premium(authContext(res).user.id);
    const rows = await db
      .select()
      .from(savedSearchesTable)
      .where(searchFilter(member.workspaceId, authContext(res).user.id))
      .orderBy(desc(savedSearchesTable.updatedAt));
    res.json({ data: rows.map(searchJson) });
  }),
);

router.post(
  `${base}/saved-searches`,
  requireCsrf,
  asyncHandler(async (req, res) => {
    const input = body(req.body);
    const name = string(input.name, "name", 80);
    const query = canonicalSearchQuery(input.query).query;
    if (typeof input.alertsEnabled !== "boolean")
      invalid("alertsEnabled", "invalid_type");
    await premium(authContext(res).user.id);
    const saved = await withCutoverGate({ kind: "http" }, async (tx, state) => {
      const member = await own(res, current(res).workspaceId, tx);
      assertWorkspaceWriteEnabled(state.mode, member.type);
      assertWorkspaceWritable(member);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`saved-searches:${member.workspaceId}`}, 0))`,
      );
      const filter = searchFilter(member.workspaceId, authContext(res).user.id);
      const [total] = await tx
        .select({ value: count() })
        .from(savedSearchesTable)
        .where(filter);
      const [duplicate] = await tx
        .select({ id: savedSearchesTable.id })
        .from(savedSearchesTable)
        .where(and(filter, eq(savedSearchesTable.query, query)))
        .limit(1);
      if (duplicate)
        throw new ConflictError(
          "A saved search with this query already exists",
          [{ field: "query", issue: "duplicate", existingId: duplicate.id }],
        );
      if (Number(total?.value ?? 0) >= 50)
        throw new ConflictError("Saved search limit reached", [
          { field: "limit", issue: "max_saved_searches" },
        ]);
      const now = new Date();
      const [row] = await tx
        .insert(savedSearchesTable)
        .values({
          id: randomUUID(),
          userId: authContext(res).user.id,
          workspaceId: member.workspaceId,
          name,
          query,
          alertsEnabled: input.alertsEnabled as boolean,
          createdAt: now,
          updatedAt: now,
          lastCheckedAt: input.alertsEnabled ? now : null,
        })
        .returning();
      return searchJson(row!);
    });
    res.status(201).json(saved);
  }),
);

router.patch(
  `${base}/saved-searches/:searchId`,
  requireCsrf,
  asyncHandler(async (req, res) => {
    const input = body(req.body);
    if (
      input.name === undefined &&
      input.query === undefined &&
      input.alertsEnabled === undefined
    )
      invalid("body", "too_small");
    const name =
      input.name === undefined ? undefined : string(input.name, "name", 80);
    const query =
      input.query === undefined
        ? undefined
        : canonicalSearchQuery(input.query).query;
    if (
      input.alertsEnabled !== undefined &&
      typeof input.alertsEnabled !== "boolean"
    )
      invalid("alertsEnabled", "invalid_type");
    await premium(authContext(res).user.id);
    const saved = await withCutoverGate({ kind: "http" }, async (tx, state) => {
      const member = await own(res, current(res).workspaceId, tx);
      assertWorkspaceWriteEnabled(state.mode, member.type);
      assertWorkspaceWritable(member);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`saved-searches:${member.workspaceId}`}, 0))`,
      );
      const filter = searchFilter(member.workspaceId, authContext(res).user.id);
      const [existing] = await tx
        .select()
        .from(savedSearchesTable)
        .where(
          and(filter, eq(savedSearchesTable.id, String(req.params.searchId))),
        )
        .limit(1);
      if (!existing) throw new WorkspaceNotFoundError();
      if (query !== undefined && query !== existing.query) {
        const [duplicate] = await tx
          .select({ id: savedSearchesTable.id })
          .from(savedSearchesTable)
          .where(
            and(
              filter,
              eq(savedSearchesTable.query, query),
              ne(savedSearchesTable.id, existing.id),
            ),
          )
          .limit(1);
        if (duplicate)
          throw new ConflictError(
            "A saved search with this query already exists",
            [{ field: "query", issue: "duplicate", existingId: duplicate.id }],
          );
      }
      const now = new Date();
      const [row] = await tx
        .update(savedSearchesTable)
        .set({
          name: name ?? existing.name,
          query: query ?? existing.query,
          alertsEnabled:
            (input.alertsEnabled as boolean | undefined) ??
            existing.alertsEnabled,
          updatedAt: now,
          ...(query !== undefined && query !== existing.query
            ? { newMatchesCount: 0, lastCheckedAt: now }
            : {}),
        })
        .where(and(filter, eq(savedSearchesTable.id, existing.id)))
        .returning();
      return searchJson(row!);
    });
    res.json(saved);
  }),
);

router.delete(
  `${base}/saved-searches/:searchId`,
  requireCsrf,
  asyncHandler(async (req, res) => {
    await premium(authContext(res).user.id);
    await withCutoverGate({ kind: "http" }, async (tx, state) => {
      const member = await own(res, current(res).workspaceId, tx);
      assertWorkspaceWriteEnabled(state.mode, member.type);
      assertWorkspaceWritable(member);
      const [row] = await tx
        .update(savedSearchesTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            searchFilter(member.workspaceId, authContext(res).user.id),
            eq(savedSearchesTable.id, String(req.params.searchId)),
          ),
        )
        .returning({ id: savedSearchesTable.id });
      if (!row) throw new WorkspaceNotFoundError();
    });
    res.status(204).end();
  }),
);

router.get(
  `${base}/notifications`,
  asyncHandler(async (req, res) => {
    await premium(authContext(res).user.id);
    const member = current(res);
    const p = page(req.query.page, "page", 1, Number.MAX_SAFE_INTEGER);
    const size = page(req.query.pageSize, "pageSize", 20, 50);
    if (
      req.query.unreadOnly !== undefined &&
      req.query.unreadOnly !== "true" &&
      req.query.unreadOnly !== "false"
    )
      invalid("unreadOnly");
    const unreadOnly = req.query.unreadOnly === "true";
    const filter = and(
      eq(notificationsTable.workspaceId, member.workspaceId),
      eq(notificationsTable.userId, authContext(res).user.id),
    );
    const listFilter = and(
      filter,
      unreadOnly ? isNull(notificationsTable.readAt) : undefined,
    );
    const [[total], rows, [unread]] = await Promise.all([
      db.select({ value: count() }).from(notificationsTable).where(listFilter),
      db
        .select()
        .from(notificationsTable)
        .where(listFilter)
        .orderBy(desc(notificationsTable.createdAt))
        .limit(size)
        .offset((p - 1) * size),
      db
        .select({ value: count() })
        .from(notificationsTable)
        .where(and(filter, isNull(notificationsTable.readAt))),
    ]);
    res.json({
      data: rows.map((row) => toNotification(row, new Set<string>())),
      pagination: pagination(p, size, Number(total?.value ?? 0)),
      unreadCount: Number(unread?.value ?? 0),
    });
  }),
);

router.patch(
  `${base}/notifications/read`,
  requireCsrf,
  asyncHandler(async (req, res) => {
    const input = body(req.body);
    const ids = input.ids;
    if (input.all !== true && (!Array.isArray(ids) || ids.length === 0))
      invalid("body", "missing_target");
    if (
      ids !== undefined &&
      (!Array.isArray(ids) ||
        ids.length > 100 ||
        ids.some((id) => typeof id !== "string" || !id))
    )
      invalid("ids", "invalid_array");
    await premium(authContext(res).user.id);
    const result = await withCutoverGate(
      { kind: "http" },
      async (tx, state) => {
        const member = await own(res, current(res).workspaceId, tx);
        assertWorkspaceWriteEnabled(state.mode, member.type);
        assertWorkspaceWritable(member);
        const filter = and(
          eq(notificationsTable.workspaceId, member.workspaceId),
          eq(notificationsTable.userId, authContext(res).user.id),
        );
        await tx
          .update(notificationsTable)
          .set({ readAt: new Date() })
          .where(
            and(
              filter,
              isNull(notificationsTable.readAt),
              input.all === true
                ? undefined
                : inArray(notificationsTable.id, ids as string[]),
            ),
          );
        const [unread] = await tx
          .select({ value: count() })
          .from(notificationsTable)
          .where(and(filter, isNull(notificationsTable.readAt)));
        return { unreadCount: Number(unread?.value ?? 0) };
      },
    );
    res.json(result);
  }),
);

router.get(
  `${base}/recommendations`,
  asyncHandler(async (req, res) => {
    await premium(authContext(res).user.id);
    const member = current(res);
    const p = page(req.query.page, "page", 1, Number.MAX_SAFE_INTEGER);
    const size = page(req.query.pageSize, "pageSize", 10, 50);
    const userId = authContext(res).user.id;
    const filter = and(
      eq(userRecommendationsTable.workspaceId, member.workspaceId),
      eq(userRecommendationsTable.userId, userId),
      eq(tendersTable.status, "open"),
      gt(tendersTable.proposalDeadline, new Date()),
      isNull(savedTendersTable.tenderId),
    );
    const joined = () =>
      db
        .select({
          recommendation: userRecommendationsTable,
          tender: tendersTable,
        })
        .from(userRecommendationsTable)
        .innerJoin(
          tendersTable,
          eq(tendersTable.id, userRecommendationsTable.tenderId),
        )
        .leftJoin(
          savedTendersTable,
          and(
            eq(savedTendersTable.tenderId, tendersTable.id),
            eq(savedTendersTable.workspaceId, member.workspaceId),
            eq(savedTendersTable.userId, userId),
          ),
        );
    const [[total], rows] = await Promise.all([
      db
        .select({ value: count() })
        .from(userRecommendationsTable)
        .innerJoin(
          tendersTable,
          eq(tendersTable.id, userRecommendationsTable.tenderId),
        )
        .leftJoin(
          savedTendersTable,
          and(
            eq(savedTendersTable.tenderId, tendersTable.id),
            eq(savedTendersTable.workspaceId, member.workspaceId),
            eq(savedTendersTable.userId, userId),
          ),
        )
        .where(filter),
      joined()
        .where(filter)
        .orderBy(asc(userRecommendationsTable.rank))
        .limit(size)
        .offset((p - 1) * size),
    ]);
    res.json({
      data: rows.map(({ recommendation, tender }) => {
        const detail = tenderRowToDetail(tender);
        const {
          description: _description,
          processNumber: _processNumber,
          items: _items,
          documents: _documents,
          timeline: _timeline,
          createdAt: _createdAt,
          detailsFetchedAt: _detailsFetchedAt,
          ...summary
        } = detail;
        return {
          tender: summary,
          score: Number(recommendation.score),
          reasons: recommendation.reasons,
          generatedAt: recommendation.generatedAt,
        };
      }),
      pagination: {
        ...pagination(p, size, Number(total?.value ?? 0)),
        totalIsEstimate: false,
      },
    });
  }),
);

router.get(
  `${base}/dashboard`,
  asyncHandler(async (_req, res) => {
    const member = current(res);
    const userId = authContext(res).user.id;
    const [saved, searches, notifications, recommendations] = await Promise.all(
      [
        db
          .select({ value: count() })
          .from(savedTendersTable)
          .where(
            and(
              eq(savedTendersTable.workspaceId, member.workspaceId),
              eq(savedTendersTable.userId, userId),
            ),
          ),
        db
          .select({ value: count() })
          .from(savedSearchesTable)
          .where(searchFilter(member.workspaceId, userId)),
        db
          .select({ value: count() })
          .from(notificationsTable)
          .where(
            and(
              eq(notificationsTable.workspaceId, member.workspaceId),
              eq(notificationsTable.userId, userId),
              isNull(notificationsTable.readAt),
            ),
          ),
        db
          .select({ value: count() })
          .from(userRecommendationsTable)
          .where(
            and(
              eq(userRecommendationsTable.workspaceId, member.workspaceId),
              eq(userRecommendationsTable.userId, userId),
            ),
          ),
      ],
    );
    res.json({
      widgets: [
        { type: "saved_tenders", count: Number(saved[0]?.value ?? 0) },
        { type: "saved_searches", count: Number(searches[0]?.value ?? 0) },
        {
          type: "unread_notifications",
          count: Number(notifications[0]?.value ?? 0),
        },
        {
          type: "recommendations",
          count: Number(recommendations[0]?.value ?? 0),
        },
      ],
    });
  }),
);

export default router;
