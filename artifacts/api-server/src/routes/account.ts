import { Router, type IRouter } from "express";
import {
  createSavedSearch,
  getSavedTender,
  deleteSavedSearch,
  deleteSavedTender,
  importSavedTenders,
  listNotifications,
  listSavedSearches,
  listSavedTenders,
  markNotificationsRead,
  markSavedSearchSeen,
  putSavedTender,
  restoreSavedSearch,
  savedTenderIds,
  unreadNotificationCount,
  updateSavedSearch,
} from "../account/account-service";
import {
  deleteAccount,
  exportAccountData,
} from "../account/account-privacy-service";
import {
  getNotificationPreferences,
  unsubscribeEmail,
  updateNotificationPreferences,
  type EmailDigestPreference,
  type UnsubscribeScope,
} from "../account/notification-preferences-service";
import {
  asyncHandler,
  authContext,
  clearSessionCookie,
  requireAuth,
  requireCsrf,
} from "../auth/http";
import { requireSubscription } from "../billing/require-subscription";
import { InvalidParameterError } from "../lib/api-error";
import { parseParticipationPatch, parseStage } from '../account/participation';
import { scheduleRecommendationRebuild } from "../recommendations/recommendation-service";
import { getUsageProfile, updateUsageProfile } from "../account/usage-profile-service";

const router: IRouter = Router();

router.get("/v1/me/usage-profile", requireAuth, asyncHandler(async (_req, res) => {
  res.json(await getUsageProfile(authContext(res).user.id));
}));
router.patch("/v1/me/usage-profile", requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  res.json(await updateUsageProfile(authContext(res).user.id, req.body));
}));

const recordBody = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidParameterError("Request body must be an object", [
      { field: "body", issue: "invalid_type" },
    ]);
  }
  return value as Record<string, unknown>;
};

const integer = (
  value: unknown,
  field: string,
  fallback: number,
  maximum: number,
): number => {
  if (value === undefined) return fallback;
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isInteger(parsed) || Number(parsed) < 1 || Number(parsed) > maximum) {
    throw new InvalidParameterError(`${field} is invalid`, [
      { field, issue: "out_of_range" },
    ]);
  }
  return Number(parsed);
};

const boolean = (value: unknown, field: string): boolean | undefined => {
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new InvalidParameterError(`${field} is invalid`, [
    { field, issue: "invalid_type" },
  ]);
};

const string = (
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string => {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (
    typeof value !== "string" ||
    parsed.length < minimum ||
    parsed.length > maximum
  ) {
    throw new InvalidParameterError(`${field} is invalid`, [
      { field, issue: "invalid_length" },
    ]);
  }
  return parsed;
};

const pathParam = (value: string | string[], field: string): string => {
  const parsed = Array.isArray(value) ? value[0] : value;
  if (!parsed) {
    throw new InvalidParameterError(`${field} is invalid`, [
      { field, issue: "invalid_value" },
    ]);
  }
  return parsed;
};

router.get(
  "/v1/me/export",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    res.set({
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="pardal-digital-dados-${date}.json"`,
    });
    res.json(await exportAccountData(authContext(res).user.id, now));
  }),
);

router.delete(
  "/v1/me",
  requireAuth,
  requireCsrf,
  asyncHandler(async (req, res) => {
    const body = recordBody(req.body);
    if (body.confirm !== "EXCLUIR") {
      throw new InvalidParameterError('confirm must be exactly "EXCLUIR"', [
        { field: "confirm", issue: "invalid_value" },
      ]);
    }
    await deleteAccount(authContext(res).user.id);
    clearSessionCookie(res);
    res.status(204).end();
  }),
);

router.get(
  "/v1/me/notification-preferences",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await getNotificationPreferences(authContext(res).user.id));
  }),
);

router.put(
  "/v1/me/notification-preferences",
  requireAuth,
  requireCsrf,
  asyncHandler(async (req, res) => {
    const body = recordBody(req.body);
    if (body.email !== undefined && (!body.email || typeof body.email !== "object" || Array.isArray(body.email))) {
      throw new InvalidParameterError("email preferences are invalid", [{ field: "email", issue: "invalid_type" }]);
    }
    const email = (body.email ?? {}) as Record<string, unknown>;
    if (email.digest === undefined && email.immediateCritical === undefined && body.profileAlerts === undefined) {
      throw new InvalidParameterError("At least one notification preference is required", [{ field: "body", issue: "too_small" }]);
    }
    if (
      email.digest !== undefined &&
      email.digest !== "daily" &&
      email.digest !== "off"
    ) {
      throw new InvalidParameterError("email.digest is invalid", [
        { field: "email.digest", issue: "invalid_enum" },
      ]);
    }
    if (
      email.immediateCritical !== undefined &&
      typeof email.immediateCritical !== "boolean"
    ) {
      throw new InvalidParameterError("email.immediateCritical is invalid", [
        { field: "email.immediateCritical", issue: "invalid_type" },
      ]);
    }
    if (body.profileAlerts !== undefined && typeof body.profileAlerts !== "boolean") {
      throw new InvalidParameterError("profileAlerts is invalid", [
        { field: "profileAlerts", issue: "invalid_type" },
      ]);
    }
    res.json(
      await updateNotificationPreferences({
        userId: authContext(res).user.id,
        ...(email.digest !== undefined
          ? { digest: email.digest as EmailDigestPreference }
          : {}),
        ...(email.immediateCritical !== undefined
          ? { immediateCritical: email.immediateCritical }
          : {}),
        ...(body.profileAlerts !== undefined
          ? { profileAlerts: body.profileAlerts as boolean }
          : {}),
      }),
    );
  }),
);

router.post(
  "/v1/email/unsubscribe",
  asyncHandler(async (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const token = body.token ?? req.query.token;
    const scope = body.scope ?? req.query.scope;
    if (typeof token !== "string" || token.length > 500) {
      throw new InvalidParameterError("token is invalid", [
        { field: "token", issue: "invalid_value" },
      ]);
    }
    if (scope !== "all" && scope !== "digest" && scope !== "immediate") {
      throw new InvalidParameterError("scope is invalid", [
        { field: "scope", issue: "invalid_enum" },
      ]);
    }
    res.json(
      await unsubscribeEmail({
        token,
        scope: scope as UnsubscribeScope,
      }),
    );
  }),
);

router.use("/v1/me", requireAuth, requireSubscription);

router.get(
  "/v1/me/saved-tenders",
  asyncHandler(async (req, res) => {
    if (req.query.sort !== undefined && req.query.sort !== 'saved_at' && req.query.sort !== 'deadline') {
      throw new InvalidParameterError('sort is invalid', [{ field: 'sort', issue: 'invalid_enum' }]);
    }
    const data = await listSavedTenders({
      userId: authContext(res).user.id,
      page: integer(req.query.page, "page", 1, Number.MAX_SAFE_INTEGER),
      pageSize: integer(req.query.pageSize, "pageSize", 20, 100),
      monitored: boolean(req.query.monitored, "monitored"),
      stage: parseStage(req.query.stage),
      sort: req.query.sort as 'saved_at' | 'deadline' | undefined,
      upcoming: boolean(req.query.upcoming, 'upcoming'),
    });
    res.json(data);
  }),
);

router.get(
  "/v1/me/saved-tenders/ids",
  asyncHandler(async (_req, res) => {
    res.json(await savedTenderIds(authContext(res).user.id));
  }),
);

router.post(
  "/v1/me/saved-tenders/import",
  requireCsrf,
  asyncHandler(async (req, res) => {
    const body = recordBody(req.body);
    if (
      !Array.isArray(body.ids) ||
      body.ids.length > 500 ||
      body.ids.some((id) => typeof id !== "string" || id.trim() === "")
    ) {
      throw new InvalidParameterError("ids must contain at most 500 tender ids", [
        { field: "ids", issue: "invalid_array" },
      ]);
    }
    const userId = authContext(res).user.id;
    res.json(
      await importSavedTenders(
        userId,
        body.ids.map((id) => String(id).trim()),
      ),
    );
    scheduleRecommendationRebuild(userId);
  }),
);

router.get(
  '/v1/me/saved-tenders/:tenderId',
  asyncHandler(async (req, res) => {
    res.json(await getSavedTender(authContext(res).user.id, pathParam(req.params.tenderId, 'tenderId')));
  }),
);

router.put(
  "/v1/me/saved-tenders/:tenderId",
  requireCsrf,
  asyncHandler(async (req, res) => {
    const body = recordBody(req.body);
    const monitored = boolean(body.monitored, "monitored");
    const userId = authContext(res).user.id;
    res.json(
      await putSavedTender({
        ...parseParticipationPatch(body),
        userId,
        tenderId: pathParam(req.params.tenderId, "tenderId"),
        monitored,
      }),
    );
    scheduleRecommendationRebuild(userId);
  }),
);

router.delete(
  "/v1/me/saved-tenders/:tenderId",
  requireCsrf,
  asyncHandler(async (req, res) => {
    await deleteSavedTender(
      authContext(res).user.id,
      pathParam(req.params.tenderId, "tenderId"),
    );
    scheduleRecommendationRebuild(authContext(res).user.id);
    res.status(204).end();
  }),
);

router.get(
  "/v1/me/saved-searches",
  asyncHandler(async (_req, res) => {
    res.json(await listSavedSearches(authContext(res).user.id));
  }),
);

router.post(
  "/v1/me/saved-searches",
  requireCsrf,
  asyncHandler(async (req, res) => {
    const body = recordBody(req.body);
    if (typeof body.alertsEnabled !== "boolean") {
      throw new InvalidParameterError("alertsEnabled is required", [
        { field: "alertsEnabled", issue: "invalid_type" },
      ]);
    }
    const saved = await createSavedSearch({
      userId: authContext(res).user.id,
      name: string(body.name, "name", 1, 80),
      query: string(body.query, "query", 0, 2000),
      alertsEnabled: body.alertsEnabled,
    });
    scheduleRecommendationRebuild(authContext(res).user.id);
    res.status(201).json(saved);
  }),
);

router.patch(
  "/v1/me/saved-searches/:id",
  requireCsrf,
  asyncHandler(async (req, res) => {
    const body = recordBody(req.body);
    const supplied = ["name", "query", "alertsEnabled"].filter(
      (field) => body[field] !== undefined,
    );
    if (supplied.length === 0) {
      throw new InvalidParameterError("At least one field is required", [
        { field: "body", issue: "too_small" },
      ]);
    }
    if (body.alertsEnabled !== undefined && typeof body.alertsEnabled !== "boolean") {
      throw new InvalidParameterError("alertsEnabled is invalid", [
        { field: "alertsEnabled", issue: "invalid_type" },
      ]);
    }
    const userId = authContext(res).user.id;
    res.json(
      await updateSavedSearch({
        userId,
        id: pathParam(req.params.id, "id"),
        ...(body.name !== undefined
          ? { name: string(body.name, "name", 1, 80) }
          : {}),
        ...(body.query !== undefined
          ? { query: string(body.query, "query", 0, 2000) }
          : {}),
        ...(body.alertsEnabled !== undefined
          ? { alertsEnabled: body.alertsEnabled }
          : {}),
      }),
    );
    scheduleRecommendationRebuild(userId);
  }),
);

router.delete(
  "/v1/me/saved-searches/:id",
  requireCsrf,
  asyncHandler(async (req, res) => {
    await deleteSavedSearch(
      authContext(res).user.id,
      pathParam(req.params.id, "id"),
    );
    scheduleRecommendationRebuild(authContext(res).user.id);
    res.status(204).end();
  }),
);

router.post(
  "/v1/me/saved-searches/:id/restore",
  requireCsrf,
  asyncHandler(async (req, res) => {
    const userId = authContext(res).user.id;
    res.json(
      await restoreSavedSearch(
        userId,
        pathParam(req.params.id, "id"),
      ),
    );
    scheduleRecommendationRebuild(userId);
  }),
);

router.post(
  "/v1/me/saved-searches/:id/seen",
  requireCsrf,
  asyncHandler(async (req, res) => {
    res.json(
      await markSavedSearchSeen(
        authContext(res).user.id,
        pathParam(req.params.id, "id"),
      ),
    );
  }),
);

router.get(
  "/v1/me/notifications",
  asyncHandler(async (req, res) => {
    res.json(
      await listNotifications({
        userId: authContext(res).user.id,
        unreadOnly: boolean(req.query.unreadOnly, "unreadOnly") ?? false,
        page: integer(req.query.page, "page", 1, Number.MAX_SAFE_INTEGER),
        pageSize: integer(req.query.pageSize, "pageSize", 20, 50),
      }),
    );
  }),
);

router.get(
  "/v1/me/notifications/unread-count",
  asyncHandler(async (_req, res) => {
    res.json({
      unreadCount: await unreadNotificationCount(authContext(res).user.id),
    });
  }),
);

router.post(
  "/v1/me/notifications/read",
  requireCsrf,
  asyncHandler(async (req, res) => {
    const body = recordBody(req.body);
    const ids = Array.isArray(body.ids) ? body.ids : undefined;
    if (
      (ids === undefined || ids.length === 0) &&
      body.all !== true
    ) {
      throw new InvalidParameterError("ids or all=true is required", [
        { field: "body", issue: "missing_target" },
      ]);
    }
    if (
      ids &&
      (ids.length > 100 || ids.some((id) => typeof id !== "string" || id === ""))
    ) {
      throw new InvalidParameterError("Notification ids are invalid", [
        { field: "ids", issue: "invalid_array" },
      ]);
    }
    res.json(
      await markNotificationsRead({
        userId: authContext(res).user.id,
        ...(ids ? { ids: ids.map(String) } : {}),
        all: body.all === true,
      }),
    );
  }),
);

export default router;
