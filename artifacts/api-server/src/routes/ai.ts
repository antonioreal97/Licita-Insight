import { Router, type IRouter } from "express";
import { askTender, getAskStatus, hasAiAccess } from "../ai/ask-tender-service";
import {
  asyncHandler,
  authContext,
  requireAuth,
  requireCsrf,
} from "../auth/http";
import { requireSubscription } from "../billing/require-subscription";
import { InvalidParameterError } from "../lib/api-error";
import {
  deleteCompanyProfile,
  getCompanyProfile,
  getTenderFits,
  parseCompanyProfileInput,
  putCompanyProfile,
} from "../ai/company-fit-service";
import { getTenderSheet } from "../ai/tender-sheet-service";
import { scheduleRecommendationRebuild } from "../recommendations/recommendation-service";

const router: IRouter = Router();

router.get(
  "/v1/me/company-profile",
  requireAuth,
  requireSubscription,
  asyncHandler(async (_req, res) => {
    res.json({ profile: await getCompanyProfile(authContext(res).user.id) });
  }),
);

router.put(
  "/v1/me/company-profile",
  requireAuth,
  requireCsrf,
  requireSubscription,
  asyncHandler(async (req, res) => {
    const input = parseCompanyProfileInput(req.body);
    const userId = authContext(res).user.id;
    res.json({ profile: await putCompanyProfile(userId, input) });
    scheduleRecommendationRebuild(userId);
  }),
);

router.delete(
  "/v1/me/company-profile",
  requireAuth,
  requireCsrf,
  requireSubscription,
  asyncHandler(async (_req, res) => {
    await deleteCompanyProfile(authContext(res).user.id);
    scheduleRecommendationRebuild(authContext(res).user.id);
    res.status(204).end();
  }),
);

router.get(
  "/v1/me/fit",
  requireAuth,
  asyncHandler(async (req, res) => {
    const raw = req.query.tenderIds;
    const tenderIds = (
      Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]
    )
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
    const uniqueIds = [...new Set(tenderIds)];
    if (
      uniqueIds.length < 1 ||
      uniqueIds.length > 100 ||
      uniqueIds.some((id) => id.length > 200)
    ) {
      throw new InvalidParameterError(
        "tenderIds must contain from 1 to 100 ids",
        [{ field: "tenderIds", issue: "invalid_length" }],
      );
    }
    res.json(await getTenderFits(authContext(res).user.id, uniqueIds));
  }),
);

router.get(
  "/v1/tenders/:id/ask-status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = authContext(res).user.id;
    const trigger = await hasAiAccess(userId);
    res.json(await getAskStatus(userId, String(req.params.id), trigger));
  }),
);

router.get(
  "/v1/tenders/:id/sheet",
  requireAuth,
  requireSubscription,
  asyncHandler(async (req, res) => {
    res.json(await getTenderSheet(String(req.params.id), authContext(res).user.id));
  }),
);

router.post(
  "/v1/tenders/:id/ask",
  requireAuth,
  requireCsrf,
  requireSubscription,
  asyncHandler(async (req, res) => {
    const question =
      typeof req.body?.question === "string" ? req.body.question.trim() : "";
    if (question.length < 3 || question.length > 300) {
      throw new InvalidParameterError(
        "Question must contain between 3 and 300 characters",
        [
          {
            field: "question",
            issue: "Must contain between 3 and 300 characters",
          },
        ],
      );
    }
    res.json(
      await askTender(
        authContext(res).user.id,
        String(req.params.id),
        question,
      ),
    );
  }),
);

export default router;
