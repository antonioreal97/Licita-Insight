import { Router, type IRouter } from "express";
import {
  asyncHandler,
  authContext,
  requireAuth,
  requireCsrf,
} from "../auth/http";
import { requireSubscription } from "../billing/require-subscription";
import { InvalidParameterError } from "../lib/api-error";
import {
  deleteRecommendationHistory,
  dismissRecommendation,
  getRecommendationPreferences,
  listRecommendations,
  recordRecommendationEvent,
  updateRecommendationPreferences,
} from "../recommendations/recommendation-service";
import { isDismissReason } from "../recommendations/triage-feedback";

const router: IRouter = Router();
const positiveInteger = (value: unknown, fallback: number, maximum: number) => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum)
    throw new InvalidParameterError("Pagination is invalid", [
      { field: "pagination", issue: "out_of_range" },
    ]);
  return parsed;
};

router.get(
  "/v1/me/recommendation-preferences",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await getRecommendationPreferences(authContext(res).user.id));
  }),
);

router.put(
  "/v1/me/recommendation-preferences",
  requireAuth,
  requireCsrf,
  asyncHandler(async (req, res) => {
    if (typeof req.body?.personalizationEnabled !== "boolean") {
      throw new InvalidParameterError("personalizationEnabled is required", [
        { field: "personalizationEnabled", issue: "invalid_type" },
      ]);
    }
    if (
      req.body.deleteHistory !== undefined &&
      typeof req.body.deleteHistory !== "boolean"
    ) {
      throw new InvalidParameterError("deleteHistory is invalid", [
        { field: "deleteHistory", issue: "invalid_type" },
      ]);
    }
    if (
      req.body.showInternationalOpportunities !== undefined &&
      typeof req.body.showInternationalOpportunities !== "boolean"
    ) {
      throw new InvalidParameterError(
        "showInternationalOpportunities is invalid",
        [{ field: "showInternationalOpportunities", issue: "invalid_type" }],
      );
    }
    res.json(
      await updateRecommendationPreferences(
        authContext(res).user.id,
        req.body.personalizationEnabled,
        req.body.personalizationEnabled
          ? false
          : req.body.deleteHistory !== false,
        new Date(),
        req.body.showInternationalOpportunities,
      ),
    );
  }),
);

router.delete(
  "/v1/me/recommendation-history",
  requireAuth,
  requireCsrf,
  asyncHandler(async (_req, res) => {
    await deleteRecommendationHistory(authContext(res).user.id);
    res.status(204).end();
  }),
);

router.post(
  "/v1/recommendations/events",
  requireAuth,
  requireCsrf,
  asyncHandler(async (req, res) => {
    const userId = authContext(res).user.id;
    if (
      req.body?.type === "search" &&
      typeof req.body.query === "string" &&
      req.body.query.trim().length <= 2_000
    ) {
      res.status(202).json({
        recorded: await recordRecommendationEvent(userId, {
          type: "search",
          query: req.body.query,
        }),
      });
      return;
    }
    if (
      req.body?.type === "tender_view" &&
      typeof req.body.tenderId === "string" &&
      req.body.tenderId.length <= 200
    ) {
      res.status(202).json({
        recorded: await recordRecommendationEvent(userId, {
          type: "tender_view",
          tenderId: req.body.tenderId,
        }),
      });
      return;
    }
    if (req.body?.type === "click") {
      res.status(202).json({
        recorded: await recordRecommendationEvent(userId, { type: "click" }),
      });
      return;
    }
    if (
      req.body?.type === "interest" &&
      typeof req.body.tenderId === "string" &&
      req.body.tenderId.length > 0 &&
      req.body.tenderId.length <= 200
    ) {
      res.status(202).json({
        recorded: await recordRecommendationEvent(userId, {
          type: "interest",
          tenderId: req.body.tenderId,
        }),
      });
      return;
    }
    throw new InvalidParameterError("Recommendation event is invalid", [
      { field: "body", issue: "invalid_value" },
    ]);
  }),
);

router.get(
  "/v1/recommendations",
  requireAuth,
  requireSubscription,
  asyncHandler(async (req, res) => {
    const scope = req.query.scope ?? "all";
    if (scope !== "all" && scope !== "profile")
      throw new InvalidParameterError("scope is invalid", [
        { field: "scope", issue: "invalid_enum" },
      ]);
    res.json(
      await listRecommendations(
        authContext(res).user.id,
        positiveInteger(req.query.page, 1, Number.MAX_SAFE_INTEGER),
        positiveInteger(req.query.pageSize, 10, 50),
        scope,
      ),
    );
  }),
);

router.post(
  "/v1/recommendations/:tenderId/dismiss",
  requireAuth,
  requireCsrf,
  requireSubscription,
  asyncHandler(async (req, res) => {
    const tenderId = String(req.params.tenderId ?? "");
    if (!tenderId || tenderId.length > 200)
      throw new InvalidParameterError("tenderId is invalid", [
        { field: "tenderId", issue: "invalid_value" },
      ]);
    const reason = req.body?.reason;
    if (reason !== undefined && !isDismissReason(reason))
      throw new InvalidParameterError("Dismissal reason is invalid", [
        { field: "reason", issue: "invalid_value" },
      ]);
    await dismissRecommendation(
      authContext(res).user.id,
      tenderId,
      new Date(),
      reason,
    );
    res.status(204).end();
  }),
);

export default router;
