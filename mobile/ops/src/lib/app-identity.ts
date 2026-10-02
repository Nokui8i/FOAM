import * as Application from "expo-application";
import Constants from "expo-constants";

import type { StaffPortal } from "@foam/staff-core";

/**
 * Canonical identity for this native binary.
 * Must match app.json package/bundle and StaffAuthProvider portal.
 * Never infer portal from staff role.
 */
export const FOAM_APP_PORTAL: StaffPortal = "ops";
export const FOAM_APP_PACKAGE = "app.foam.ops";
export const FOAM_APP_SLUG = "foam-ops";

/**
 * Detect Dev Client loading the wrong Metro project (e.g. Driver bundle inside OPS APK).
 * Returns null when identity is consistent.
 */
export function getFoamAppIdentityError(): string | null {
  const nativeId = Application.applicationId?.trim() || null;
  const configPackage =
    Constants.expoConfig?.android?.package?.trim() ||
    Constants.expoConfig?.ios?.bundleIdentifier?.trim() ||
    null;
  const slug = Constants.expoConfig?.slug?.trim() || null;

  if (nativeId && nativeId !== FOAM_APP_PACKAGE) {
    return `Native package is "${nativeId}" but this source expects "${FOAM_APP_PACKAGE}".`;
  }

  if (configPackage && configPackage !== FOAM_APP_PACKAGE) {
    return (
      `Wrong JS bundle: Metro config package is "${configPackage}" ` +
      `but this native app is "${FOAM_APP_PACKAGE}". ` +
      `Stop other Expo/Metro processes and start Metro from mobile/ops.`
    );
  }

  if (slug && slug !== FOAM_APP_SLUG) {
    return (
      `Wrong JS bundle: Expo slug is "${slug}" (expected "${FOAM_APP_SLUG}"). ` +
      `OPS Dev Client is connected to the wrong Metro project.`
    );
  }

  return null;
}

export function assertStaffPortalMatchesApp(portal: StaffPortal): void {
  if (portal !== FOAM_APP_PORTAL) {
    throw new Error(
      `StaffAuthProvider portal="${portal}" does not match this app's portal="${FOAM_APP_PORTAL}".`
    );
  }
}
