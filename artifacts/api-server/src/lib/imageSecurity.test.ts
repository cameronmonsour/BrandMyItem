import assert from "node:assert/strict";
import test from "node:test";
import { imageResponsePolicy } from "./imageSecurity.ts";

test("raster images remain inline", () => {
  assert.deepEqual(imageResponsePolicy("image/png"), {
    contentType: "image/png",
    attachment: false,
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