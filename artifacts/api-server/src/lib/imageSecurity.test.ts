import assert from "node:assert/strict";
import test from "node:test";
import { imageResponsePolicy } from "./imageSecurity.ts";

test("user-supplied raster originals are forced to download", () => {
  assert.deepEqual(imageResponsePolicy("image/png"), {
    contentType: "application/octet-stream",
    attachment: true,
  });
});

test("SVG and unknown objects are forced to download as generic bytes", () => {
  assert.deepEqual(imageResponsePolicy("image/svg+xml"), {
    contentType: "application/octet-stream",
    attachment: true,
  });
  assert.deepEqual(imageResponsePolicy("text/html"), {
    contentType: "application/octet-stream",
    attachment: true,
  });
});