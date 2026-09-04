import { Router, type IRouter } from "express";
import healthRouter from "./health.ts";
import commerceRouter from "./commerce.ts";
import storageRouter from "./storage.ts";
import fulfillmentRouter from "./fulfillment.ts";
import campaignDraftRouter from "./campaignDrafts.ts";
import sponsorReservationDraftRouter from "./sponsorReservationDrafts.ts";
import contactRouter from "./contact.ts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(commerceRouter);
router.use(campaignDraftRouter);
router.use(sponsorReservationDraftRouter);
router.use(contactRouter);
router.use(storageRouter);
router.use(fulfillmentRouter);

export default router;
