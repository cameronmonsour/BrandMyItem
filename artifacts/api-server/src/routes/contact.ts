import { Router, type IRouter } from "express";
import {
  SendContactMessageBody,
  SendContactMessageResponse,
} from "@workspace/api-zod";
import { sendTransactionalEmail } from "../emailDelivery.ts";
import { contactSupportEmail } from "../emailTemplates.ts";

const router: IRouter = Router();

router.post("/contact", async (req, res): Promise<void> => {
  const body = SendContactMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Please complete every contact form field." });
    return;
  }

  try {
    await sendTransactionalEmail(contactSupportEmail(body.data));
  } catch (error) {
    req.log.error({ err: error }, "Unable to deliver contact form message");
    res.status(502).json({
      error: "We could not send your message. Please email support@brandmyitem.com.",
    });
    return;
  }

  res.status(202).json(SendContactMessageResponse.parse({ accepted: true }));
});

export default router;