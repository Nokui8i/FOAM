import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const requireFunctions = createRequire(new URL("../functions/lib/index.js", import.meta.url));
const { assertCallerMayChargeOrder } = requireFunctions("./index.js");
const source = readFileSync(new URL("../functions/src/index.ts", import.meta.url), "utf8");

function functionBody(name) {
  const start = source.indexOf(`export const ${name}`);
  assert.ok(start > 0, name);
  const next = source.indexOf("\nexport const ", start + 10);
  return source.slice(start, next > start ? next : undefined);
}

test("driver can charge only the order assigned in Firestore", () => {
  assert.doesNotThrow(() => assertCallerMayChargeOrder("driver", "driver-1", {
    assignedDriverUid: "driver-1",
  }));
  assert.throws(
    () => assertCallerMayChargeOrder("driver", "driver-1", {}),
    (err) => err.code === "permission-denied"
  );
  assert.throws(
    () => assertCallerMayChargeOrder("driver", "driver-1", {
      assignedDriverUid: "driver-2",
    }),
    (err) => err.code === "permission-denied"
  );
});

test("admin and manager charges are not blocked by driver assignment", () => {
  const unassigned = {};
  const otherDriver = { assignedDriverUid: "driver-2" };
  assert.doesNotThrow(() => assertCallerMayChargeOrder("admin", "owner", unassigned));
  assert.doesNotThrow(() => assertCallerMayChargeOrder("admin", "admin-1", otherDriver));
  assert.doesNotThrow(() => assertCallerMayChargeOrder("manager", "manager-1", unassigned));
  assert.doesNotThrow(() => assertCallerMayChargeOrder("manager", "manager-1", otherDriver));
});

test("rejected driver charge is decided before any Stripe PaymentIntent", () => {
  for (const name of ["chargeOrder", "createOnSpotPaymentIntent", "finalizeOnSpotCharge", "chargeOrderMore"]) {
    const body = functionBody(name);
    const auth = body.indexOf("assertCallerMayChargeOrder(staff.role, request.auth.uid, order)");
    const stripeCreate = body.indexOf("paymentIntents.create");
    const stripeRead = body.indexOf("paymentIntents.retrieve");
    const lock = body.indexOf("acquireChargeLock");
    assert.ok(auth > 0, `${name} checks the stored assignment`);
    assert.equal(body.includes("request.data.assignedDriverUid"), false, name);
    assert.equal(body.includes("request.data?.assignedDriverUid"), false, name);
    if (stripeCreate > 0) assert.ok(auth < stripeCreate, name);
    if (stripeRead > 0) assert.ok(auth < stripeRead, name);
    if (lock > 0) assert.ok(auth < lock, name);
  }
  const topUp = functionBody("chargeOrderMore");
  const auth = topUp.indexOf("assertCallerMayChargeOrder");
  const driversDenied = topUp.indexOf("Only owners and managers can charge more.");
  assert.ok(auth > 0 && driversDenied > auth);
});
