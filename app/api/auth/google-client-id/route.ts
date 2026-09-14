import { NextResponse } from "next/server";

/**
 * Not used by the current sign-in flow — Google/Apple sign-in goes through
 * Firebase's signInWithPopup/signInWithRedirect directly, not Google
 * Identity Services, so nothing in the app calls this route. It originally
 * fetched live project config server-side at request time, which is
 * incompatible with `output: "export"` (a static Firebase Hosting
 * deploy has no server to run that fetch on). Stubbed static-safe instead
 * of removed, in case Google Identity Services support is picked back up
 * later — at that point this needs its dynamic fetch back and the app
 * needs a server runtime (Cloud Functions/Cloud Run via Firebase Hosting,
 * which requires the Blaze plan) instead of a static export.
 */
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(
    { error: "Not available on the static export." },
    { status: 404 }
  );
}
