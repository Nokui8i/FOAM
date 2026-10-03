import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const requireFunctions = createRequire(new URL("../functions/lib/index.js", import.meta.url));
const { limitGuestCaller, requestClientIp } = requireFunctions("./index.js");

function forwarded(value) {
  return { rawRequest: { headers: { "x-forwarded-for": value }, ip: "1.1.1.1" } };
}

test("same client hits the rate limit", async () => {
  const request = forwarded("203.0.113.20, 35.191.0.4");
  const action = `unit-repeat-${Date.now()}`;
  await limitGuestCaller(request, action, 2, 60_000);
  await limitGuestCaller(request, action, 2, 60_000);
  await assert.rejects(
    () => limitGuestCaller(request, action, 2, 60_000),
    (err) => err.code === "resource-exhausted"
  );
});

test("changing the caller-supplied X-Forwarded-For prefix does not open a new bucket", async () => {
  const action = `unit-xff-${Date.now()}`;
  const first = forwarded("198.51.100.1, 203.0.113.40, 35.191.0.8");
  const rotated = forwarded("203.0.113.99, 198.51.100.1, 203.0.113.40, 35.191.0.8, 169.254.1.1");
  assert.equal(requestClientIp(first), "203.0.113.40");
  assert.equal(requestClientIp(rotated), "203.0.113.40");
  assert.notEqual(requestClientIp(first), "198.51.100.1");
  await limitGuestCaller(first, action, 1, 60_000);
  await assert.rejects(
    () => limitGuestCaller(rotated, action, 1, 60_000),
    (err) => err.code === "resource-exhausted"
  );
});

test("missing or invalid IP metadata still rate limits", async () => {
  const action = `unit-missing-${Date.now()}`;
  await limitGuestCaller({}, action, 1, 60_000);
  await assert.rejects(
    () => limitGuestCaller({ rawRequest: { headers: { "x-forwarded-for": "not-an-ip" }, ip: "8.8.8.8" } }, action, 1, 60_000),
    (err) => err.code === "resource-exhausted"
  );
  await assert.rejects(
    () => limitGuestCaller({ rawRequest: { ip: "203.0.113.7" } }, action, 1, 60_000),
    (err) => err.code === "resource-exhausted"
  );
});

test("a normal platform client IP is allowed under the limit", async () => {
  const request = forwarded("203.0.113.70, 35.191.0.9");
  const action = `unit-ok-${Date.now()}`;
  await limitGuestCaller(request, action, 2, 60_000);
  await limitGuestCaller(request, action, 2, 60_000);
});
