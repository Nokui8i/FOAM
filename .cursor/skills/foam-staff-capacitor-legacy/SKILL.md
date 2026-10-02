---
name: foam-staff-capacitor-legacy
description: >-
  Maintains existing FOAM Capacitor staff WebView apps (android/, android-driver/,
  ios/) only when the user explicitly asks for Capacitor fixes. Do not use for
  new native architecture, Expo apps, or migrating features that belong in React
  Native + Expo.
---

# FOAM staff Capacitor (legacy)

## When to use

- User explicitly asks to maintain or fix existing Capacitor OPS/Driver shells

## When NOT to use

- New native mobile architecture or features → React Native + Expo (`foam-native-feature` / `foam-mobile-bootstrap`)
- Automatic migration or deletion of Capacitor projects
- Extending Capacitor as the long-term staff app platform

## Facts

- Capacitor apps are **legacy / current staff WebView** applications.
- Paths: `android/`, `android-driver/`, `ios/`, `capacitor.config.ts`, `capacitor.driver.config.ts`
- They must **not** become the new native architecture.

## Workflow

1. Confirm the user asked for Capacitor maintenance (not Expo).
2. Limit changes to Capacitor shell / sync / splash / native chrome as requested.
3. Do not migrate Capacitor → Expo as a side effect.
4. Do not delete Capacitor projects unless explicitly requested.
5. Do not add new product features here when they belong in RN + Expo.
6. Summarize changes; no commit / push / deploy / Firebase changes unless explicitly requested.

## Safety

- Follow `foam-no-capacitor-shortcuts` and `foam-architecture-boundaries`.
- Prefer fixing the WebView shell only; do not invent a second mobile stack inside Capacitor.
