import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type RequestHandler } from "express";
import { ApiError, NotFoundError, UnauthenticatedError } from "../lib/api-error";

const MIN_INGEST_API_TOKEN_LENGTH = 32;

type PncpIngestModule = typeof import("../ingest/collect-pncp");
type OpportunitiesIngestModule = typeof import("../ingest/collect-opportunities");

interface IngestRouterDependencies {
  loadPncpIngest?: () => Promise<PncpIngestModule>;
  loadOpportunitiesIngest?: () => Promise<OpportunitiesIngestModule>;
}

const configuredIngestApiToken = () => {
  const token = process.env.INGEST_API_TOKEN;
  return token && token.length >= MIN_INGEST_API_TOKEN_LENGTH ? token : null;
};

const secureDigest = (value: string) =>
  createHash("sha256").update(value, "utf8").digest();

const tokensMatch = (received: string, expected: string) =>
  timingSafeEqual(secureDigest(received), secureDigest(expected));

export const requireIngestApiToken: RequestHandler = (req, _res, next) => {
  const expected = configuredIngestApiToken();
  if (!expected) {
    next(new NotFoundError(`Route ${req.method} ${req.path} was not found`));
    return;
  }

  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token || !tokensMatch(token, expected)) {
    next(new UnauthenticatedError("Invalid ingest API token"));
    return;
  }

  next();
};

export const createIngestRouter = ({
  loadPncpIngest = () => import("../ingest/collect-pncp"),
  loadOpportunitiesIngest = () => import("../ingest/collect-opportunities"),
}: IngestRouterDependencies = {}): IRouter => {
  const router: IRouter = Router();

  router.use("/v1/ingest", requireIngestApiToken);

  router.post("/v1/ingest/pncp", async (req, res, next) => {
    try {
      const { collectOptionsFromBody, startPncpIngest } = await loadPncpIngest();
      const options = collectOptionsFromBody(req.body);
      const run = await startPncpIngest(options);
      res.status(202).json(run);
    } catch (error) {
      const { IngestInProgressError } = await loadPncpIngest();
      if (error instanceof IngestInProgressError) {
        next(new ApiError(409, "INGEST_IN_PROGRESS", error.message));
        return;
      }
      next(error);
    }
  });

  router.get("/v1/ingest/pncp", async (_req, res, next) => {
    try {
      const { getLatestIngest } = await loadPncpIngest();
      res.json(await getLatestIngest());
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/ingest/opportunities", async (_req, res, next) => {
    try {
      const { CultureIngestInProgressError, startCultureIngest } =
        await loadOpportunitiesIngest();
      const run = await startCultureIngest();
      res.status(202).json(run);
    } catch (error) {
      const { CultureIngestInProgressError } = await loadOpportunitiesIngest();
      if (error instanceof CultureIngestInProgressError) {
        next(new ApiError(409, "INGEST_IN_PROGRESS", error.message));
        return;
      }
      next(error);
    }
  });

  router.get("/v1/ingest/opportunities", async (_req, res, next) => {
    try {
      const { getLatestCultureIngest } = await loadOpportunitiesIngest();
      res.json(await getLatestCultureIngest());
    } catch (error) {
      next(error);
    }
  });

  return router;
};

const router = createIngestRouter();

export default router;
