import { Router, type IRouter } from "express";
import { GetTenderHighlightsResponse } from "@workspace/api-zod";
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
import { loadRequirementHighlights } from "../ai/tender-highlights";
import { scheduleRecommendationRebuild } from "../recommendations/recommendation-service";
import { isWorkspaceId } from "../workspaces/workspace-service";

const router: IRouter = Router();

const profileWorkspaceId = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !isWorkspaceId(value)) {
    throw new InvalidParameterError("workspaceId is invalid", [
      { field: "workspaceId", issue: "invalid_value" },
    ]);
  }
  return value;
};

/** `tenderIds` query (repeated): 1 to 100 distinct ids. */
const parseTenderIds = (raw: unknown): string[] => {
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
  return uniqueIds;
};

router.get(
  "/v1/me/company-profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ profile: await getCompanyProfile(authContext(res).user.id, profileWorkspaceId(req.query.workspaceId)) });
  }),
);

router.put(
  "/v1/me/company-profile",
  requireAuth,
  requireCsrf,
  asyncHandler(async (req, res) => {
    const input = parseCompanyProfileInput(req.body);
    const userId = authContext(res).user.id;
    res.json({ profile: await putCompanyProfile(userId, input, new Date(), undefined, profileWorkspaceId(req.query.workspaceId)) });
    scheduleRecommendationRebuild(userId);
  }),
);

router.delete(
  "/v1/me/company-profile",
  requireAuth,
  requireCsrf,
  asyncHandler(async (req, res) => {
    await deleteCompanyProfile(authContext(res).user.id, new Date(), undefined, profileWorkspaceId(req.query.workspaceId));
    scheduleRecommendationRebuild(authContext(res).user.id);
    res.status(204).end();
  }),
);

router.get(
  "/v1/me/fit",
  requireAuth,
  asyncHandler(async (req, res) => {
    const uniqueIds = parseTenderIds(req.query.tenderIds);
    res.json(await getTenderFits(authContext(res).user.id, uniqueIds));
  }),
);

/**
 * Requirement highlights for result cards, read from already-ready tender sheets only: listing never generates a
 * sheet or calls a model. Same gate as the sheet itself (subscription), since they summarize it.
 */
router.get(
  "/v1/me/tender-highlights",
  requireAuth,
  requireSubscription,
  asyncHandler(async (req, res) => {
    const uniqueIds = parseTenderIds(req.query.tenderIds);
    const highlights = await loadRequirementHighlights(uniqueIds);
    res.json(
      GetTenderHighlightsResponse.parse({
        results: Object.fromEntries(
          [...highlights].map(([tenderId, requirements]) => [tenderId, { requirements }]),
        ),
      }),
    );
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
