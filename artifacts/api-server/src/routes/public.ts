import { Router, type IRouter } from "express";
import { ApiError } from "../lib/api-error";
import { logger } from "../lib/logger";
import { isDatabaseUnavailable } from "../lib/pg-error";
import { getOpenTendersByState } from "../services/open-tenders-by-state";

const router: IRouter = Router();

// Aggregates for the public landing page: no session, the same answer for everyone, safe for shared caches.
router.get("/v1/public/tenders/by-state", async (_req, res, next) => {
  try {
    if (!process.env.DATABASE_URL) {
      throw new ApiError(503, "SEARCH_UNAVAILABLE", "DATABASE_URL is not set");
    }
    const body = await getOpenTendersByState();
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    res.json(body);
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    logger.error({ err: error }, "Open tenders by state failed");
    next(
      isDatabaseUnavailable(error)
        ? new ApiError(503, "SEARCH_UNAVAILABLE", "Tender search is unavailable")
        : error,
    );
  }
});

export default router;
