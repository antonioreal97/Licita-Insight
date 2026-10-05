import { Router, type IRouter } from "express";
import { ApiError, NotFoundError } from "../lib/api-error";
import { logger } from "../lib/logger";
import { parseTransparencyQuery } from "../lib/transparency-query";
import { publicHttpCache } from "../middlewares/request-protection";

const router: IRouter = Router();

const serve = (error: unknown, next: (error: unknown) => void) => {
  if (error instanceof ApiError) return next(error);
  logger.error({ err: error }, "Transparency query failed");
  next(new ApiError(503, "SEARCH_UNAVAILABLE", "Transparency data is unavailable"));
};

router.get("/v1/transparency/contracts", publicHttpCache, async (req, res, next) => {
  try {
    if (!process.env.DATABASE_URL) throw new ApiError(503, "SEARCH_UNAVAILABLE", "DATABASE_URL is not set");
    const { searchTransparencyContracts } = await import("../repositories/postgres-transparency-repository");
    res.json(await searchTransparencyContracts(parseTransparencyQuery(req.query)));
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
