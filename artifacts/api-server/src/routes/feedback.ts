import { Router, type IRouter } from "express";
import { asyncHandler, requireCsrf } from "../auth/http";
import type { AuthContext } from "../auth/session-service";
import {
  createTenderFeedback,
  parseTenderFeedbackInput,
  parseTenderId,
  truncateUserAgent,
} from "../feedback/tender-feedback-service";

const router: IRouter = Router();

/**
 * Tender page feedback (tender-feedback-v1). No session or subscription required: request protection already resolved
 * a valid `licita_session` into `res.locals.auth` and charges the write (user) or public_write (IP) window.
 */
router.post(
  "/v1/tenders/:id/feedback",
  requireCsrf,
  asyncHandler(async (req, res) => {
    const tenderId = parseTenderId(req.params.id);
    const input = parseTenderFeedbackInput(req.body);
    const auth = res.locals.auth as AuthContext | undefined;
    const created = await createTenderFeedback({
      tenderId,
      userId: auth?.user.id ?? null,
      input,
      userAgent: truncateUserAgent(req.header("user-agent")),
    });
    res.status(201).json(created);
  }),
);

export default router;
