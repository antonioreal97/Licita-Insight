import { Router, type IRouter } from "express";
import authRouter from "./auth";
import aiRouter from "./ai";
import accountRouter from "./account";
import billingRouter from "./billing";
import healthRouter from "./health";
import featureFlagsRouter from "./feature-flags";
import ingestRouter from "./ingest";
import opportunitiesRouter from "./opportunities";
import profileRouter from "./profile";
import recommendationsRouter from "./recommendations";
import searchRouter from "./search";
import transparencyRouter from "./transparency";

const router: IRouter = Router();

router.use(healthRouter);
router.use(featureFlagsRouter);
router.use(authRouter);
router.use(billingRouter);
router.use(aiRouter);
// Privacy controls under /v1/me need only a session; register them before
// accountRouter's subscription gate for paid /v1/me routes.
router.use(recommendationsRouter);
router.use(accountRouter);
router.use(searchRouter);
router.use(transparencyRouter);
router.use(opportunitiesRouter);
router.use(profileRouter);
router.use(ingestRouter);

export default router;
