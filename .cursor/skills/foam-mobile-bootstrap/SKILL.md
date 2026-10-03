---
name: foam-mobile-bootstrap
description: >-
  Safely scaffolds future FOAM React Native + Expo apps (mobile/driver,
  mobile/ops) and optional packages/foam-staff-core. Use only when the user
  explicitly asks to create native Expo projects. Do not use during preparation
  stages, or to rewrite the existing web app.
---

# FOAM mobile bootstrap

## When to use

- User explicitly requests scaffolding Expo / RN apps for Driver and/or OPS

## When NOT to use

- Preparation-only stages (rules/skills only)
- Feature work inside apps that already exist → `foam-native-feature`
- Reintroducing Capacitor or a WebView shell

## Workflow (when invoked)

1. Inspect repository structure.
2. Confirm existing web architecture (Next.js remains).
3. Confirm Firebase architecture (same project; no parallel project).
4. Confirm package manager and workspace layout.
5. Confirm Node/toolchain requirements for Expo.
6. **Propose exact files/directories** and wait for approval before creating.
7. Create native Expo projects **only after approval**.
8. Never rewrite the existing web application.
9. Never replace Firebase / create a second backend or database.
10. Never deploy.
11. Never commit or push unless explicitly requested.
12. Do not recreate Capacitor projects. Native apps stay Expo under `mobile/`.

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
