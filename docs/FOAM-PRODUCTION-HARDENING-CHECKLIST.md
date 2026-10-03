# FOAM Production Hardening Checklist

Whenever one of these items is completed, update this checklist immediately and mark the exact item as completed. Do not remove completed items; preserve the history.

Before declaring FOAM production hardening fully complete, run a new read-only production audit and verify that there are 0 CRITICAL and 0 HIGH findings.

Source of truth: production audit of `foam-laundry-app` on 2026-10-03, including the follow-up that fixed the three HIGH findings and redeployed Functions, Firestore Rules, and Hosting.

## FOAM Production Hardening Status

Current status:

- 0 CRITICAL
- 0 HIGH

The main Firebase/backend hardening phase has been completed.

Latest audit date: 2026-10-03.

### A. Completed

Already verified on 2026-10-03:

- [x] Firestore security isolation
- [x] Storage security
- [x] Customer isolation
- [x] Driver order isolation
- [x] orderBilling isolation
- [x] Stripe payment isolation
- [x] Server-side payment amount calculation
- [x] Double-charge protection
- [x] Stripe webhook signature verification
- [x] Stripe receipt_email configuration
- [x] Scheduled 365-day retention
- [x] orderBilling cleanup
- [x] orderTracks cleanup
- [x] Order photo cleanup
- [x] Guest order server-side creation
- [x] Guest rate limiting
- [x] Driver payment authorization
- [x] Firestore Rules tests
- [x] Storage Rules tests
- [x] Functions tests
- [x] Retention tests
- [x] Receipt tests
- [x] Native Driver typecheck
- [x] Native OPS typecheck

Current order retention is already defined and implemented. Do not modify these rules:

- Delivered: 365 days
- Cancelled: immediate deletion
- Other orders: 365 days, with the existing pickup-date exception
- Contact messages: 365 days
- orderBilling: deleted with the order
- orderTracks: deleted with the order
- Order photos: deleted with the order

## B. Remaining technical hardening

These are follow-up hardening tasks. They are not current CRITICAL or HIGH findings.

### App Check

Status: NOT IMPLEMENTED

Do not enable enforcement before Web, Driver, and OPS are correctly initialized and tested.

- [ ] Initialize Firebase App Check on Customer Web.
- [ ] Initialize App Check on Native Driver.
- [ ] Initialize App Check on Native OPS.
- [ ] Test development builds without breaking authentication or API calls.
- [ ] Verify all required Firebase Functions receive valid App Check tokens.
- [ ] Verify Firestore interactions remain functional.
- [ ] Only after all clients are verified, evaluate enabling App Check enforcement.
- [ ] Test production behavior after enforcement.

### Remove obsolete Firebase Auth domain

- [ ] Remove `192.168.1.61` from Firebase Authorized Domains when local-LAN authentication is no longer needed.

Keep `localhost` for development unless there is a specific reason to remove it.

### Artifact Registry cleanup

- [ ] Configure an appropriate cleanup policy for `gcf-artifacts`.
- [ ] Verify old Cloud Functions build images are automatically cleaned.
- [ ] Confirm the cleanup policy does not remove active or current images.

### ensurePickupAvailability rate limit

- [ ] Add server-side rate limiting to `ensurePickupAvailability`.
- [ ] Preserve legitimate booking behavior.
- [ ] Test repeated requests.
- [ ] Verify the limit cannot be bypassed through client changes.

### Staff security hardening

- [ ] Enforce `staffBanned` at the Firestore Rule or server boundary, not only in client logic.
- [ ] Prevent applicants from self-requesting privileged `admin` or `manager` roles where appropriate.
- [ ] Decide whether approved staff admins should require a verified email.
- [ ] If approved, implement that policy server-side.

### Password policy

- [ ] Decide whether the current 6-character minimum is sufficient.
- [ ] If changing it, define migration behavior for existing accounts.
- [ ] Implement only after the business and security policy is approved.

### Storage image validation

- [ ] Consider server-side validation that uploaded files are actually valid images, rather than relying only on the declared `contentType`.
- [ ] Preserve the existing 8 MB limit.
- [ ] Preserve the existing authorization rules.

## Cost and scalability follow-up

This is not currently a security blocker.

### Firestore listeners

- [ ] Review the OPS `orders` listener as production order volume grows.
- [ ] Review the OPS `contactMessages` listener.
- [ ] Review the customer booking date listener.
- [ ] Identify opportunities to replace broad listeners with scoped queries.
- [ ] Monitor Firestore reads and cost before making unnecessary architectural changes.

## C. Future product-development work

This is product development, not a current Firebase security blocker.

### Native apps

- [ ] Native Driver order listener and workflow.
- [ ] Native OPS order listener and workflow.
- [ ] Driver pickup workflow.
- [ ] Weighing.
- [ ] Photos.
- [ ] Dry-cleaning.
- [ ] Charging.
- [ ] Out-for-delivery.
- [ ] Delivery confirmation.
- [ ] Tracking.
- [ ] Notifications.

## Backup and recovery follow-up

### Firestore recovery verification

- [ ] Confirm the first scheduled weekly Firestore backup has actually been created.
- [ ] Confirm backup retention is 7 days.
- [ ] Confirm PITR remains enabled for 7 days.
- [ ] Confirm delete protection remains enabled.

### Storage recovery

- [ ] Periodically verify Storage soft-delete remains enabled for 7 days.
- [ ] Review whether a lifecycle policy is needed later.

## D. Business and policy decisions

POLICY DECISION REQUIRED

Do not invent retention periods for the items below. No FOAM deletion period is defined for them yet.

- [ ] Define a retention policy for `users`.
- [ ] Define a retention policy for Firebase Auth accounts.
- [ ] Define a retention policy for `staff`.
- [ ] Define a retention policy for `staffBanned`.
- [ ] Define a retention policy for `promoCodes`.
- [ ] Define a retention policy for `pickupAvailability`.
- [ ] Define a retention policy for `pickupDayOverrides`.
- [ ] Define a retention policy for `config`.
- [ ] Define a retention policy for `rateLimits`.
- [ ] Decide what FOAM should retain or delete in Stripe for customers, PaymentIntents, and refunds, subject to Stripe's own retention requirements.

Order retention above is already implemented. Do not change those rules while deciding the items in this section.

The password minimum and the verified-email requirement for approved staff admins also need a decision before any implementation. Those decisions are tracked under remaining technical hardening.

## Firebase Console follow-up

Manual checks only. Do not delete `foam-operations-hub.web.app` automatically.

- [ ] Remove `192.168.1.61` when it is no longer needed.
- [ ] Keep `localhost` while development requires it.
- [ ] Confirm App Check configuration after implementation.
- [ ] Confirm the first scheduled Firestore backup exists.
- [ ] Confirm the Artifact Registry cleanup policy.
- [ ] Review `foam-operations-hub.web.app` when the final Hosting and domain architecture is decided.
- [ ] Confirm the final production custom domain when FOAM moves to it.

## Do not forget

These items are intentionally not blockers today:

- App Check
- localhost authorization
- Artifact Registry cleanup
- ensurePickupAvailability rate limiting
- staff hardening
- listener optimization
- Native Driver order workflow
- Native OPS order workflow
- undefined retention policies

The production audit on 2026-10-03 found 0 CRITICAL and 0 HIGH findings. Handle the remaining items from this checklist. Do not treat them as emergency security incidents.
