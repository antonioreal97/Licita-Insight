import { Router, type IRouter } from "express";
import {
  journeyFeatureFlagsFromEnv,
  type JourneyFeatureFlags,
} from "../features/journey-flags";

const configuredFlags = journeyFeatureFlagsFromEnv();

export function createFeatureFlagsRouter(
  readFlags: () => JourneyFeatureFlags = () => configuredFlags,
): IRouter {
  const router: IRouter = Router();
  router.get("/v1/public/feature-flags", (_req, res) => {
    res.setHeader(
      "Cache-Control",
      "public, max-age=60, stale-while-revalidate=300",
    );
    res.json(readFlags());
  });
  return router;
}

export default createFeatureFlagsRouter();
