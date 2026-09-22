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

export default router;
