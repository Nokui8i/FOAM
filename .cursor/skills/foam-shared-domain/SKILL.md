---
name: foam-shared-domain
description: >-
  Safely identifies and extracts platform-independent FOAM business logic into
  packages/foam-staff-core. Use when preparing shared types, validation, domain
  models, or contracts for web + React Native. Do not use to move UI, Next.js
  components, or browser-only code into the shared package.
---

# FOAM shared domain

## When to use

- User asks to extract reusable staff/domain logic for mobile + web
- Planning `packages/foam-staff-core/` contents

## When NOT to use

- Moving screens, components, or styles into a shared package
- Refactoring “because it looks reusable” without a mobile consumer need
- Changing Firebase rules/functions as part of extraction without approval

## Workflow

1. Inspect existing domain logic (`lib/`, related modules).
2. Identify dependencies (Next.js, DOM, Capacitor, browser APIs, Firebase client).
3. Separate pure logic from Next.js / browser / UI code.
4. Identify Firebase-specific code — keep client usage isolated; do not embed Admin SDK.
5. Identify browser-only dependencies — leave them out of the shared package.
6. Propose extraction boundaries and file list; get agreement before large moves.
7. Avoid unnecessary refactoring.
8. Preserve existing web behavior and imports (compatibility shims if needed).
9. Extract only reusable logic: types, models, validation, pure utilities, contracts, carefully isolated service abstractions.
10. Verify existing web behavior after extraction (build/lint/smoke as appropriate).

## Potential package

`packages/foam-staff-core/`

## Do not

- Extract code merely because it looks reusable
- Move UI or Next.js components into the shared package
- Break existing imports without a migration path
- Commit / push / deploy unless explicitly requested
