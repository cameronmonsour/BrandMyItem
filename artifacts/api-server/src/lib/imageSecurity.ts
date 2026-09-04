const safeInlineImageTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export function imageResponsePolicy(contentType: unknown): {
  contentType: string;
  attachment: boolean;
} {
  const normalized = String(contentType || "").toLowerCase();
  if (safeInlineImageTypes.has(normalized)) {
    return { contentType: normalized, attachment: false };
  }
  return { contentType: "application/octet-stream", attachment: true };
}