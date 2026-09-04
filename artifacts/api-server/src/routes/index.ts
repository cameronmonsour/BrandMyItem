import { Router, type IRouter } from "express";
import healthRouter from "./health.ts";
import commerceRouter from "./commerce.ts";
import storageRouter from "./storage.ts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(commerceRouter);
router.use(storageRouter);

export default router;
