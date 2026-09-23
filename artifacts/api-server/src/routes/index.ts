import { Router, type IRouter } from "express";
import authRouter from "./auth";
import accountRouter from "./account";
import healthRouter from "./health";
import ingestRouter from "./ingest";
import searchRouter from "./search";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(accountRouter);
router.use(searchRouter);
router.use(ingestRouter);

export default router;
