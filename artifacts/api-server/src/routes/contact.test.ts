import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import app from "../app.ts";

test("contact endpoint validates a complete message before sending email", async () => {
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "A sender" }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "Please complete every contact form field.",
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});