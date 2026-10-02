---
name: foam-mobile-bootstrap
description: >-
  Safely scaffolds future FOAM React Native + Expo apps (mobile/driver,
  mobile/ops) and optional packages/foam-staff-core. Use only when the user
  explicitly asks to create native Expo projects. Do not use during preparation
  stages, for Capacitor work, or to rewrite the existing web app.
---

# FOAM mobile bootstrap

## When to use

- User explicitly requests scaffolding Expo / RN apps for Driver and/or OPS

## When NOT to use

- Preparation-only stages (rules/skills only)
- Feature work inside apps that already exist → `foam-native-feature`
- Capacitor maintenance → `foam-staff-capacitor-legacy`
- Automatic migration away from Capacitor

## Workflow (when invoked)

1. Inspect repository structure.
2. Confirm existing web architecture (Next.js remains).
3. Confirm Firebase architecture (same project; no parallel project).
4. Confirm existing Capacitor apps (`android/`, `android-driver/`, `ios/`) — leave intact.
5. Confirm package manager and workspace layout.
6. Confirm Node/toolchain requirements for Expo.
7. **Propose exact files/directories** and wait for approval before creating.
8. Create native Expo projects **only after approval**.
9. Never rewrite the existing web application.
10. Never replace Firebase / create a second backend or database.
11. Never migrate Capacitor automatically.
12. Never deploy.
13. Never commit or push unless explicitly requested.

## Target layout

```
mobile/driver/              # app.foam.driver
mobile/ops/                 # app.foam.ops
packages/foam-staff-core/   # optional shared pure logic — only if approved
```

## Safety

- Expo Development Builds preferred; Expo Go is not production architecture.
- No secrets/Admin credentials in mobile config.
- Obey `foam-expo-conventions`, `foam-architecture-boundaries`, `foam-firebase-approval-gate`.
