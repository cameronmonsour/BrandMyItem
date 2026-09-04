import assert from "node:assert/strict";
import test from "node:test";
import { isDeliverableUsStreetAddress } from "./shippingAddress.ts";

const base = { recipientName: "Alex", line1: "12 Main Street", city: "Austin", state: "TX", postalCode: "78701", country: "US" };
test("US street address accepts deliverable address", () => assert.equal(isDeliverableUsStreetAddress(base), true));
for (const line1 of ["PO Box 42", "P.O. BOX 42", "Post Office Box 42", "POB 42"]) {
  test(`rejects PO Box spelling: ${line1}`, () => assert.equal(isDeliverableUsStreetAddress({ ...base, line1 }), false));
}