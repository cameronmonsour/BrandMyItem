import { Router, type IRouter } from "express";
import {
  getImageFile,
  pipeImage,
} from "../lib/objectStorage.ts";

const router: IRouter = Router();
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