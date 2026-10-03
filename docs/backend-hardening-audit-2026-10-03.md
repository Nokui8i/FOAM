# FOAM backend hardening — 2026-10-03

## Scope

Reviewed and changed the web app's Firestore rules, Functions, and pickup availability client helper on `feat/desktop-image-transitions`. No native app, visual UI, production data, or deployed Firebase resource was changed. No audit report existed in the checkout before this work.

## Changes

- `firestore.rules`
  - Restricted customer order creation to the current order field allowlist, required a bounded track key, and matched signed-in versus guest ownership explicitly. This prevents client-created payment, assignment, refund, and ledger fields.
  - Limited assigned-driver order writes to the fields the existing driver workflow uses and the currently implemented forward status transitions. Admin/manager writes remain available.
  - Linked tracking document creation and customer edit writes to an order through `getAfter` checks. Restricted driver tracking writes and customer-owned tracking edits to their respective field sets. Allowed a bounded, order-linked replay of the initial track write for the trigger/client race.
  - Made pickup availability writes admin-only; public reservation/reconciliation now goes through callable Functions.
- `functions/src/index.ts`
  - Added callable reserve/release/reconcile operations. Capacity comes from the configured schedule and day overrides and is reconciled against live waiting orders; callers cannot provide replacement counter maps.
  - Added `syncOrderTrack`, an order-write trigger that rebuilds the public tracking projection from the authoritative order, repairs partial client-side order/track writes, and removes only the linked projection when an order is deleted.
  - Added an atomic Firestore charge lock so concurrent charge calls cannot race through separate amount-based Stripe idempotency keys.
  - Added a refund lock that serializes refund attempts, rejects stale ledger snapshots, and reuses Stripe idempotency keys after an uncertain retry.
  - Validated that a saved Stripe payment method is attached to the stated customer and that the Stripe customer metadata matches the Firebase customer or guest order.
  - Compute charge amounts from the current Firestore laundry rates, dry-clean catalog, eligible repeat discount, active promo document, and customer tip. The submitted total must match this result; stale rates or removed/expired promotions require the staff client to refresh and recalculate.
  - Verify Stripe PaymentIntents and metadata against the order ledger before refunds or additional charges. On-spot payment finalization checks that the PaymentIntent is the active attempt for that order.
- `lib/pickup-availability.ts`
  - Kept the existing helper API but routed reserve/release/reconcile operations through Functions. Admin-only schedule writes remain direct.
- `tests/firestore.rules.test.mjs`, `tests/functions-pricing.test.mjs`, and `tests/functions-reliability.test.mjs`
  - Added emulator tests for order field injection, price snapshots, promos, pickup capacity permissions, driver transitions, order/tracking linkage, server-side totals, linked tracking cleanup, and refund idempotency.
- `package.json` / `package-lock.json`
  - Added Firebase Emulator test scripts, the Firebase CLI development dependency, and the Rules Unit Testing dependency.
- `firebase.json`
  - Excluded the pre-existing private `functions/.agents/` directory from Functions upload packages.
  - Set the Hosting site explicitly to the Firebase-confirmed default site `foam-laundry-app` so deployment has an unambiguous target.

## Cross-Platform Impact Check

- The web booking, weekly automation, order editing, and staff workflows were traced. Their existing helper signatures remain unchanged, so those callers do not need UI changes.
- A read-only search found no pickup counter writes or order creation workflows in `mobile/` or `packages/foam-staff-core/`; those native paths were not edited. The untracked `android-driver/` directory was also left untouched.
- An older cached web client that still directly updates `pickupAvailability` is denied by the new rules. Functions and Hosting were deployed first; users with a booking page already open must refresh it to load the callable-based client.
- Order creation still carries the saved-card identifiers already used by the booking client; charging reads authenticated customers' saved card from their protected profile and verifies the Stripe customer/payment-method relationship server-side. Existing callable signatures and pickup helper signatures were retained.

## Verification

- `functions`: `npm run build` — passed (TypeScript).
- Root Next.js: `npm run build` — passed, including TypeScript and static generation.
- `npm run test:firebase` — passed: 7 Firestore Emulator rules tests, 6 server pricing tests, and 2 server reliability tests. The Emulator used the demo project `demo-foam-rules`; no live documents were written.
- `git diff --check` — passed.
- Firebase MCP read — Firestore is Standard edition in `us-central1`; current live laundry rates are $2.60/lb standard, $2.35/lb weekly, $5 delivery, $50 minimum. The dry-clean catalog was read to confirm that the server uses the live config document.
- Firebase MCP read of live Firestore rules before deploy — confirmed the old rules were active. After deploy, a second read returned the hardened rules, including admin-only `pickupAvailability` writes.
- Firebase MCP read of deployed Functions and Firestore indexes before deploy — the existing callable/webhook Functions ran on Node.js 22 in `us-central1`; the needed `orders` composite indexes were READY.
- Firebase MCP rules validation — passed with “OK: No errors detected.”
- Production deploy — the updated Functions were deployed; Firebase MCP lists `reservePickupSlot`, `releasePickupSlot`, and `ensurePickupAvailability` in `us-central1` on Node.js 22. The deployment job reported an error only after that success because automatic Artifact Registry cleanup policy setup was denied. No `--force` cleanup-policy change was made.
- Production Hosting — succeeded for site `foam-laundry-app`, version `7508057f2c79356f`.
- Production Firestore — succeeded. A post-deploy MCP read confirmed the new Rules are live. No production documents were written or changed.
- The MCP Functions inventory does not show the `syncOrderTrack` Firestore trigger, so its live registration could not be independently confirmed. The source builds and the Functions deploy reported success, but verify this trigger in Firebase Console before relying on projection repair/deletion behavior.
- A read-only Chrome smoke check loaded the public homepage and showed the expected FOAM navigation and pricing after deploy. No booking or payment action was attempted.
- Firebase Console could not be used to inspect the missing trigger: the available browser session was signed in to an account without access to this project. No account switch or sign-in flow was attempted.

## Remaining gaps

- Stripe was not exercised against test-mode credentials, so real Stripe declines, webhook retries, and network failure recovery were not integration-tested.
- Existing orders with rates or dry-clean prices that no longer match current config/catalog, or promos that are no longer active, will require staff to refresh and recalculate before charging. No live or historical order was rewritten.
- Promo `maxUses` is checked at charge time, but concurrent promo redemption is not reserved or atomically counted here; enforce usage accounting separately if those limits must be strict under concurrency.
- Public reserve/release callables have no App Check or rate limit. Reservation validates date/slot/capacity, and release decrements one hold without going below live waiting orders, but abusive public calls could still consume or release temporary capacity. Add App Check/rate limiting after confirming the deployed web and native clients support it.
- `syncOrderTrack` is eventual consistency. It repairs missed/partial writes on retry, but no production retry/DLQ behavior was verified against deployed Functions configuration.
- Automated coverage does not call Stripe and does not exercise every Functions failure path. Firebase MCP confirmed the current Functions inventory/runtime and required order indexes, but Stripe secret values and webhook endpoint configuration were not inspected. Callable rollout behavior remains unverified.
- Firebase reported that Function deployment succeeded but could not configure the automatic Artifact Registry cleanup policy. No cleanup policy was created; older build images may accumulate until that is configured separately.
- The MCP Functions inventory does not list `syncOrderTrack`, so its presence in production remains unverified.
- Hosting and Firestore Rules deployment APIs reported success. The public homepage was smoke-checked, but the booking flow and real Stripe transaction were not exercised. No production documents were modified.

## Deployment / approval

The user explicitly approved production deployment. Functions, Hosting, and Firestore Rules were deployed in that order on 2026-10-03. The Functions deploy reached function deployment but reported the separate Artifact Registry cleanup-policy issue described above. Hosting and Rules reported success. Before placing a new booking from a tab that was already open, refresh the page so it uses the new Functions-based pickup client.
