import { Redirect } from "expo-router";

import { useStaffAuth } from "@/lib/staff-auth";

/**
 * Route guard — never expose portal by deep link while unauthorized.
 */
export default function DriverIndex() {
  const { phase } = useStaffAuth();

  if (phase === "ready") {
    return <Redirect href="/portal" />;
  }

  return <Redirect href="/login" />;
}
