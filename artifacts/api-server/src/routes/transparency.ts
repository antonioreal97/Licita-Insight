import { Router, type IRouter, type Request, type Response } from "express";
import type { AuthContext } from "../auth/session-service";
import { ApiError, NotFoundError } from "../lib/api-error";
import { logger } from "../lib/logger";
import { withinResultWindow } from "../lib/result-window";
import { parseTransparencyQuery } from "../lib/transparency-query";
import { publicHttpCache } from "../middlewares/request-protection";

const router: IRouter = Router();

/** Optional session: anonymous viewers and viewers without active access get the locked version. */
async function viewerHasAccess(req: Request, res: Response): Promise<boolean> {
  if (!res.locals.auth) {
    const { optionalAuth } = await import("../auth/http");
    await new Promise<void>((resolve, reject) => {
      void optionalAuth(req, res, (error?: unknown) => error ? reject(error) : resolve());
    });
  }
  const userId = (res.locals.auth as AuthContext | undefined)?.user.id;
  if (!userId) return false;
  const { userHasActiveAccess } = await import("../billing/require-subscription");
  return userHasActiveAccess(userId);
}

const serve = (error: unknown, next: (error: unknown) => void) => {
  if (error instanceof ApiError) return next(error);
  logger.error({ err: error }, "Transparency query failed");
  next(new ApiError(503, "SEARCH_UNAVAILABLE", "Transparency data is unavailable"));
};

router.get("/v1/transparency/contracts", publicHttpCache, async (req, res, next) => {
  try {
    if (!process.env.DATABASE_URL) throw new ApiError(503, "SEARCH_UNAVAILABLE", "DATABASE_URL is not set");
    const { searchTransparencyContracts } = await import("../repositories/postgres-transparency-repository");
    res.json(withinResultWindow(await searchTransparencyContracts(parseTransparencyQuery(req.query))));
  } catch (error) { serve(error, next); }
});

router.get("/v1/tenders/:id/award-history", publicHttpCache, async (req, res, next) => {
  try {
    if (!process.env.DATABASE_URL) throw new ApiError(503, "SEARCH_UNAVAILABLE", "DATABASE_URL is not set");
    const [{ tenderAwardHistory, awardHistoryMeta }, { AWARD_HISTORY_WINNER_NAMES, lockWinnerNames }] = await Promise.all([
      import("../repositories/postgres-award-history-repository"),
      import("../domain/award-history"),
    ]);
    const tenderId = String(req.params.id);
    const history = await tenderAwardHistory(tenderId);
    if (!history) throw new NotFoundError(`Tender ${tenderId} was not found`);
    const unlocked = AWARD_HISTORY_WINNER_NAMES === "public" || await viewerHasAccess(req, res);
    res.json({
      data: unlocked ? history : lockWinnerNames(history),
      meta: { ...awardHistoryMeta, access: { winnerNames: AWARD_HISTORY_WINNER_NAMES, unlocked } },
    });
  } catch (error) { serve(error, next); }
});

router.get("/v1/tenders/:id/transparency/:kind", publicHttpCache, async (req, res, next) => {
  try {
    if (req.params.kind !== "contracts" && req.params.kind !== "results") {
      throw new NotFoundError("Transparency resource was not found");
    }
    if (!process.env.DATABASE_URL) throw new ApiError(503, "SEARCH_UNAVAILABLE", "DATABASE_URL is not set");
    const { tenderTransparency } = await import("../repositories/postgres-transparency-repository");
    const tenderId = String(req.params.id);
    const record = await tenderTransparency(tenderId);
    if (!record) throw new NotFoundError(`Tender ${tenderId} was not found`);
    res.json({ data: record[req.params.kind], meta: record.meta });
  } catch (error) { serve(error, next); }
});

export default router;
