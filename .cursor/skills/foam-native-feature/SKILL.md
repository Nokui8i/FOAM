---
name: foam-native-feature
description: >-
  Implements a new FOAM native mobile feature for Driver or OPS using React
  Native + Expo. Use when adding or changing native mobile screens, workflows,
  permissions, camera/location, or offline-capable staff features. Do not use
  for Capacitor WebView work, web-only Next.js features, or Firebase rules/functions
  changes without approval.
---

# FOAM native feature

## When to use

- New or changed feature in future `mobile/driver` or `mobile/ops`
- Native UX, permissions, offline, camera, location, notifications

## When NOT to use

- Capacitor / WebView staff shell maintenance → use `foam-staff-capacitor-legacy`
- Scaffolding new Expo apps → use `foam-mobile-bootstrap` (only when user asks)
- Extracting shared packages → use `foam-shared-domain`
- Firebase rules/functions/Auth changes → use `foam-firebase-change-review` first
- EAS/store release → use `foam-eas-release`

## Workflow

1. Identify Driver vs OPS.
2. Inspect existing web implementation and business logic.
3. Identify reusable domain logic (types, validation, contracts) — not UI.
4. Identify native capabilities required.
5. Identify permissions.
6. Identify loading / error / offline / reconnect states (`foam-mobile-testing`).
7. Identify Firebase/backend interactions.
8. Confirm no production Firebase changes are required; if needed → STOP and get approval.
9. Implement native UI (React Native + Expo APIs only — no WebView/Capacitor shortcuts).
10. Implement failure/recovery behavior (duplicate taps, timeouts, retries).
11. Test normal and edge cases per `foam-mobile-testing`.
12. Verify no web/Capacitor shortcut was introduced.
13. Summarize changed files and remaining risks.

## Safety

- No commit / push / deploy unless explicitly requested.
- No Firebase rules, Functions, Auth, or schema edits without explicit approval.
- Do not silently modify unrelated systems.
- Follow `foam-mobile-native-architecture`, `foam-mobile-security`, `foam-expo-conventions`.
