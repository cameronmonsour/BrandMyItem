export function imageResponsePolicy(contentType: unknown): {
  contentType: string;
  attachment: boolean;
} {
  const normalized = String(contentType || "").toLowerCase();
  // User supplied originals are never an inline web document. Processed
  // derivatives must use a separate trusted serving path.
  return { contentType: "application/octet-stream", attachment: true };
}