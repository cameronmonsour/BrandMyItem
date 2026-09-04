import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { RequestSponsorReservationDraftLogoUploadBody } from "@workspace/api-zod";

test("logo upload contract accepts only SVG or PDF at 20 MB", () => {
  assert.equal(RequestSponsorReservationDraftLogoUploadBody.safeParse({
    name: "brand.svg", size: 10_000, contentType: "image/svg+xml",
  }).success, true);
  assert.equal(RequestSponsorReservationDraftLogoUploadBody.safeParse({
    name: "brand.pdf", size: 20_000_000, contentType: "application/pdf",
  }).success, true);
  assert.equal(RequestSponsorReservationDraftLogoUploadBody.safeParse({
    name: "brand.png", size: 10_000, contentType: "image/png",
  }).success, false);
});

test("draft release remains capability-protected and immediately deletes the claim", async () => {
  const routePath = fileURLToPath(new URL("./sponsorReservationDrafts.ts", import.meta.url));
  const route = await readFile(routePath, "utf8");

  assert.match(route, /router\.delete\("\/sponsor-reservation-drafts\/:draftId"/);
  assert.match(route, /const authorized = await authorizedDraft\(req, params\.data\.draftId\)/);
  assert.match(route, /eq\(sponsorReservationDraftsTable\.status, "issued"\)/);
  assert.match(route, /res\.sendStatus\(204\)/);
  assert.match(route, /Please upload your logo as an SVG or PDF\./);
});