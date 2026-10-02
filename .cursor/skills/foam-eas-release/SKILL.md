---
name: foam-eas-release
description: >-
  Safely prepares and runs FOAM Expo EAS builds and store submissions for Driver
  or OPS. Use only when the user explicitly requests a mobile build or release.
  Do not use during scaffolding or feature work; never deploy Firebase as a side
  effect.
---

# FOAM EAS release

## When to use

- User explicitly asks for an EAS build, preview build, or store submission

## When NOT to use

- Day-to-day feature development (prefer Expo Development Builds locally)
- Firebase Hosting / Functions deploy
- Automatic “ship it” after coding

## Workflow (when invoked)

1. Verify Expo/RN project configuration.
2. Verify app identifiers (`app.foam.driver` / `app.foam.ops`).
3. Verify environment (dev/staging/prod) and config.
4. Verify EAS build profile.
5. Verify Firebase **client** environment (no Admin secrets in the app).
6. Verify secrets/configuration handling (EAS secrets, not committed files).
7. Verify version / build numbers.
8. Verify tests / checklist from `foam-mobile-testing` as far as applicable.
9. Verify Android/iOS build requirements (credentials, bundle IDs).
10. Build **only after explicit request**.
11. Submit to App Store / Google Play **only after explicit request**.
12. Never deploy Firebase as a side effect of a mobile release.
13. Never commit or push automatically.

## Safety

- Expo Go is not the production architecture.
- Obey `foam-git-delivery` and `foam-firebase-approval-gate`.
- Store submission is never automatic.
