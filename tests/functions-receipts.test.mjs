import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const requireFunctions = createRequire(
  new URL("../functions/package.json", import.meta.url)
);
const {
  normalizeReceiptEmail,
  receiptParamsForAttempt,
  resolveReceiptEmail,
} = requireFunctions("./lib/receipt-email.js");

const indexSource = readFileSync(
  new URL("../functions/src/index.ts", import.meta.url),
  "utf8"
);

test("signed-in saved-card receipt uses the verified account email", () => {
  assert.equal(
    resolveReceiptEmail({
      accountUid: "uid-1",
      authEmail: "Member@Example.com",
      authEmailVerified: true,
      profileEmail: "member@example.com",
      orderContactEmail: "other@example.com",
    }),
    "member@example.com"
  );
});

test("signed-in receipt falls back to the profile email when Auth has no address", () => {
  assert.equal(
    resolveReceiptEmail({
      accountUid: "uid-1",
      authEmail: "",
      authEmailVerified: false,
      profileEmail: "member@example.com",
      orderContactEmail: "typed-at-booking@example.com",
    }),
    "member@example.com"
  );
});

test("guest receipt uses the order contact email", () => {
  assert.equal(
    resolveReceiptEmail({
      accountUid: "",
      authEmail: "staff@foam.example",
      authEmailVerified: true,
      profileEmail: "",
      orderContactEmail: "Guest@Example.com",
    }),
    "guest@example.com"
  );
});

test("on-spot receipt uses the order email and skips a missing email", () => {
  assert.equal(
    resolveReceiptEmail({
      accountUid: "",
      authEmail: "",
      authEmailVerified: false,
      profileEmail: "",
      orderContactEmail: "doorstep@example.com",
    }),
    "doorstep@example.com"
  );
  assert.equal(
    resolveReceiptEmail({
      accountUid: "",
      authEmail: "",
      authEmailVerified: false,
      profileEmail: "",
      orderContactEmail: "not-an-email",
    }),
    null
  );
  assert.equal(normalizeReceiptEmail("   "), null);
});

test("a succeeded payment is not given receipt_email again", () => {
  const first = receiptParamsForAttempt("guest@example.com", false);
  const retry = receiptParamsForAttempt("guest@example.com", false);
  assert.deepEqual(first, { receipt_email: "guest@example.com" });
  assert.deepEqual(retry, first);
  assert.deepEqual(receiptParamsForAttempt("guest@example.com", true), {});
  assert.deepEqual(receiptParamsForAttempt(null, false), {});
});

test("webhook processing does not configure a second receipt", () => {
  const webhookStart = indexSource.indexOf("export const stripeWebhook");
  const webhookEnd = indexSource.indexOf("res.json({ received: true })");
  const webhook = indexSource.slice(webhookStart, webhookEnd);
  assert.equal(webhook.includes("receiptParamsForAttempt"), false);
  assert.equal(webhook.includes("receipt_email:"), false);
  assert.equal(
    indexSource.split("receiptParamsForAttempt(receiptEmail, false)").length - 1,
    3
  );
  assert.equal(indexSource.includes("guardAgainstDoubleCharge"), true);
  assert.equal(indexSource.includes("amount: amountCents"), true);
});
