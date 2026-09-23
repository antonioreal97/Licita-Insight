import { Router, type IRouter } from "express";
import {
  createSavedSearch,
  deleteSavedSearch,
  deleteSavedTender,
  importSavedTenders,
  listNotifications,
  listSavedSearches,
  listSavedTenders,
  markNotificationsRead,
  markSavedSearchSeen,
  putSavedTender,
  savedTenderIds,
  unreadNotificationCount,
  updateSavedSearch,
} from "../account/account-service";
import { asyncHandler, authContext, requireAuth, requireCsrf } from "../auth/http";
import { InvalidParameterError } from "../lib/api-error";

const router: IRouter = Router();
router.use("/v1/me", requireAuth);

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
  "/v1/me/saved-tenders",
  asyncHandler(async (req, res) => {
    const data = await listSavedTenders({
      userId: authContext(res).user.id,
      page: integer(req.query.page, "page", 1, Number.MAX_SAFE_INTEGER),
      pageSize: integer(req.query.pageSize, "pageSize", 20, 100),
      monitored: boolean(req.query.monitored, "monitored"),
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
    res.json(
      await importSavedTenders(
        authContext(res).user.id,
        body.ids.map((id) => String(id).trim()),
      ),
    );
  }),
);

router.put(
  "/v1/me/saved-tenders/:tenderId",
  requireCsrf,
  asyncHandler(async (req, res) => {
    const body = recordBody(req.body);
    const monitored = boolean(body.monitored, "monitored");
    res.json(
      await putSavedTender({
        userId: authContext(res).user.id,
        tenderId: pathParam(req.params.tenderId, "tenderId"),
        monitored,
      }),
    );
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
    res.json(
      await updateSavedSearch({
        userId: authContext(res).user.id,
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
    res.status(204).end();
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
