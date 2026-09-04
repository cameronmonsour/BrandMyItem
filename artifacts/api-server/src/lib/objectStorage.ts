import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Storage, type File } from "@google-cloud/storage";

const SIDECAR = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function parsePath(path: string): { bucket: string; object: string } {
  const parts = path.replace(/^\/+/, "").split("/");
  if (parts.length < 2) throw new Error("Invalid object storage path");
  return { bucket: parts[0], object: parts.slice(1).join("/") };
}

export function objectPathFromUploadUrl(uploadURL: string): string {
  const url = new URL(uploadURL);
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR is not configured");
  const normalizedDir = `/${privateDir.replace(/^\/+/, "").replace(/\/+$/, "")}/`;
  if (!url.pathname.startsWith(normalizedDir)) {
    throw new Error("Signed URL is outside the private object directory");
  }
  return `/objects/${url.pathname.slice(normalizedDir.length)}`;
}

export async function createImageUploadURL(): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR is not configured");
  const { bucket, object } = parsePath(
    `${privateDir.replace(/\/+$/, "")}/uploads/${randomUUID()}`,
  );
  const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucket,
      object_name: object,
      method: "PUT",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Could not sign upload URL: ${response.status}`);
  const body = (await response.json()) as { signed_url: string };
  return body.signed_url;
}

export async function getImageFile(objectPath: string): Promise<File | null> {
  if (!/^\/objects\/uploads\/[A-Za-z0-9-]+$/.test(objectPath)) return null;
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR is not configured");
  const { bucket, object } = parsePath(
    `${privateDir.replace(/\/+$/, "")}/${objectPath.slice("/objects/".length)}`,
  );
  const file = storage.bucket(bucket).file(object);
  const [exists] = await file.exists();
  return exists ? file : null;
}

export async function verifyImageObject(objectPath: string): Promise<boolean> {
  const file = await getImageFile(objectPath);
  if (!file) return false;
  const [metadata] = await file.getMetadata();
  const allowed = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/svg+xml",
  ]);
  return (
    allowed.has(String(metadata.contentType || "").toLowerCase()) &&
    Number(metadata.size || 0) > 0 &&
    Number(metadata.size || 0) <= 10_000_000
  );
}

export async function pipeImage(file: File, res: import("express").Response): Promise<void> {
  const [metadata] = await file.getMetadata();
  res.setHeader("Content-Type", metadata.contentType || "application/octet-stream");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  if (metadata.size) res.setHeader("Content-Length", String(metadata.size));
  Readable.from(file.createReadStream()).pipe(res);
}