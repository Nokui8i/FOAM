---
name: foam-firebase-change-review
description: >-
  Reviews any FOAM Firebase-related change before implementation. Use when a
  task may touch Firestore rules, indexes, Cloud Functions, Auth, schema, or
  firebase deploy. Do not use to silently apply production Firebase changes.
---

# FOAM Firebase change review

## When to use

- Before editing rules, indexes, Functions, Auth config, or schema
- When mobile/web work appears to require a backend authorization change
- Before any `firebase deploy`

## When NOT to use

- Read-only inspection of existing Firebase-related code (allowed without this skill)
- Pure client UX that does not change server authorization

## Workflow (review — do not implement protected changes yet)

1. Identify the requested change.
2. Identify affected Firebase resources.
3. Determine client-only vs server-side.
4. Determine whether Security Rules are affected.
5. Determine whether Cloud Functions are affected.
6. Determine whether Auth configuration is affected.
7. Determine whether production data/schema is affected.
8. Identify security implications (privilege escalation, data exposure).
9. Identify rollback / recovery implications.
10. Report required approvals (what must be explicitly approved).
11. **Do not make protected changes without explicit approval** in the current conversation.

## Protected without approval

- `firestore.rules`, `firestore.indexes.json`
- Cloud Functions source/config
- Auth / project configuration
- Production schema
- Any `firebase deploy` target
- Deleting Firebase resources

## Safety

- Client checks are UX only; real auth stays in rules/functions.
- Do not weaken rules to unblock mobile.
- No commit / push / deploy unless explicitly requested after approval.
