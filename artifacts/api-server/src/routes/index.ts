import { Router, type IRouter } from "express";
import healthRouter from "./health";
import commerceRouter from "./commerce";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(commerceRouter);
router.use(storageRouter);

export default router;
