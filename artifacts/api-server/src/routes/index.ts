import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ingestRouter from "./ingest";
import searchRouter from "./search";

const router: IRouter = Router();

router.use(healthRouter);
router.use(searchRouter);
router.use(ingestRouter);

export default router;
