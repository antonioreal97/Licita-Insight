import { Router, type IRouter } from "express";
import { requireAuth } from "../auth/http";
import { requireSubscription } from "../billing/require-subscription";
import { ApiError, NotFoundError } from "../lib/api-error";
import { logger } from "../lib/logger";
import { parseOpportunityQuery } from "../lib/opportunity-query";
import { pgErrorCode } from "../lib/pg-error";
import { withinResultWindow } from "../lib/result-window";
import { publicHttpCache } from "../middlewares/request-protection";
import { authContext } from "../auth/http";

const router: IRouter = Router();
router.use("/v1/opportunities", requireAuth, requireSubscription);
router.use("/v1/opportunities", publicHttpCache);

const exposeOpportunityError = (error: unknown): unknown => {
  if (error instanceof ApiError) return error;
  logger.error({ err: error }, "Opportunity search failed");
  const code = pgErrorCode(error);
  if (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "57P01" ||
    code === "28P01" ||
    code === "3D000" ||
    code === "42P01" ||
    code === "08006" ||
    code === "08001"
  ) {
    return new ApiError(
      503,
      "SEARCH_UNAVAILABLE",
      "Opportunity search is unavailable",
    );
  }
  return error;
};

const requireDatabase = (): void => {
  if (!process.env.DATABASE_URL) {
    throw new ApiError(503, "SEARCH_UNAVAILABLE", "DATABASE_URL is not set");
  }
};

router.get("/v1/opportunities", async (req, res, next) => {
  try {
    requireDatabase();
    const criteria = parseOpportunityQuery(req.query);
    const { searchOpportunities } =
      await import("../repositories/postgres-opportunity-repository");
    res.json(withinResultWindow(await searchOpportunities(criteria, authContext(res).user.id)));
  } catch (error) {
    next(exposeOpportunityError(error));
  }
});

router.get("/v1/opportunities/:id", async (req, res, next) => {
  try {
    requireDatabase();
    const { findOpportunity } =
      await import("../repositories/postgres-opportunity-repository");
    const opportunity = await findOpportunity(
      req.params.id,
      authContext(res).user.id,
    );
    if (!opportunity) {
      throw new NotFoundError(`Opportunity ${req.params.id} was not found`);
    }
    res.json(opportunity);
  } catch (error) {
    next(exposeOpportunityError(error));
  }
});

export default router;
