import { Router, type IRouter } from "express";
import { ApiError } from "../lib/api-error";

const router: IRouter = Router();

router.post("/v1/ingest/pncp", async (req, res, next) => {
  try {
    const { collectOptionsFromBody, IngestInProgressError, startPncpIngest } =
      await import("../ingest/collect-pncp");
    const options = collectOptionsFromBody(req.body);
    const run = await startPncpIngest(options);
    res.status(202).json(run);
  } catch (error) {
    const { IngestInProgressError } = await import("../ingest/collect-pncp");
    if (error instanceof IngestInProgressError) {
      next(new ApiError(409, "INGEST_IN_PROGRESS", error.message));
      return;
    }
    next(error);
  }
});

router.get("/v1/ingest/pncp", async (_req, res, next) => {
  try {
    const { getLatestIngest } = await import("../ingest/collect-pncp");
    res.json(await getLatestIngest());
  } catch (error) {
    next(error);
  }
});

router.post("/v1/ingest/opportunities", async (_req, res, next) => {
  try {
    const { CultureIngestInProgressError, startCultureIngest } = await import(
      "../ingest/collect-opportunities"
    );
    try {
      const run = await startCultureIngest();
      res.status(202).json(run);
    } catch (error) {
      if (error instanceof CultureIngestInProgressError) {
        next(new ApiError(409, "INGEST_IN_PROGRESS", error.message));
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.get("/v1/ingest/opportunities", async (_req, res, next) => {
  try {
    const { getLatestCultureIngest } = await import("../ingest/collect-opportunities");
    res.json(await getLatestCultureIngest());
  } catch (error) {
    next(error);
  }
});

export default router;
