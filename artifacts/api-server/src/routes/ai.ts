import { Router, type IRouter } from "express";
import { askTender, getAskStatus, hasAiAccess } from "../ai/ask-tender-service";
import { asyncHandler, authContext, requireAuth, requireCsrf } from "../auth/http";
import { requireSubscription } from "../billing/require-subscription";
import { InvalidParameterError } from "../lib/api-error";

const router: IRouter = Router();

router.get(
  "/v1/tenders/:id/ask-status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = authContext(res).user.id;
    const trigger = await hasAiAccess(userId);
    res.json(await getAskStatus(userId, String(req.params.id), trigger));
  }),
);

router.post(
  "/v1/tenders/:id/ask",
  requireAuth,
  requireCsrf,
  requireSubscription,
  asyncHandler(async (req, res) => {
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    if (question.length < 3 || question.length > 300) {
      throw new InvalidParameterError("Question must contain between 3 and 300 characters", [
        { field: "question", issue: "Must contain between 3 and 300 characters" },
      ]);
    }
    res.json(await askTender(authContext(res).user.id, String(req.params.id), question));
  }),
);

export default router;
