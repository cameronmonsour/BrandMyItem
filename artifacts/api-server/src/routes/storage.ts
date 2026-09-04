import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import {
  createImageUploadURL,
  getImageFile,
  objectPathFromUploadUrl,
  pipeImage,
} from "../lib/objectStorage";

const router: IRouter = Router();

router.post("/storage/uploads/request-url", async (req, res): Promise<void> => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid image metadata" });
    return;
  }
  const uploadURL = await createImageUploadURL();
  res.setHeader("Cache-Control", "no-store");
  res.json(
    RequestUploadUrlResponse.parse({
      uploadURL,
      objectPath: objectPathFromUploadUrl(uploadURL),
      metadata: parsed.data,
    }),
  );
});

router.get("/storage/objects/*objectPath", async (req, res): Promise<void> => {
  const raw = req.params.objectPath;
  const suffix = Array.isArray(raw) ? raw.join("/") : raw;
  const file = await getImageFile(`/objects/${suffix}`);
  if (!file) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  await pipeImage(file, res);
});

export default router;