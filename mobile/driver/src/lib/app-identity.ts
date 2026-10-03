import Constants from "expo-constants";

import type { StaffPortal } from "@foam/staff-core";

/**
 * Canonical identity for this native binary.
 * Must match app.json package/bundle and StaffAuthProvider portal.
 * Never infer portal from staff role.
 */
export const FOAM_APP_PORTAL: StaffPortal = "driver";
export const FOAM_APP_PACKAGE = "app.foam.driver";
export const FOAM_APP_SLUG = "foam-driver";

/**
 * Detect Dev Client loading the wrong Metro project (e.g. OPS bundle inside Driver APK).
 * Uses Expo config from the loaded JS bundle — when OPS Metro serves OPS source into
 * the Driver APK, slug/package will be foam-ops / app.foam.ops and this fails.
 *
 * Note: this check lives in Driver source. If the wrong Metro serves OPS source,
 * OPS's own app-identity runs instead — so always start Metro from mobile/driver
 * for the Driver Dev Client.
 */
export function getFoamAppIdentityError(): string | null {
  const configPackage =
    Constants.expoConfig?.android?.package?.trim() ||
    Constants.expoConfig?.ios?.bundleIdentifier?.trim() ||
    null;
  const slug = Constants.expoConfig?.slug?.trim() || null;

  if (configPackage && configPackage !== FOAM_APP_PACKAGE) {
    return (
      `Wrong JS bundle: Metro config package is "${configPackage}" ` +
      `but this app expects "${FOAM_APP_PACKAGE}". ` +
      `Stop other Expo/Metro processes and start Metro from mobile/driver.`
    );
  }

  if (slug && slug !== FOAM_APP_SLUG) {
    return (
      `Wrong JS bundle: Expo slug is "${slug}" (expected "${FOAM_APP_SLUG}"). ` +
      `Driver Dev Client is connected to the wrong Metro project.`
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
