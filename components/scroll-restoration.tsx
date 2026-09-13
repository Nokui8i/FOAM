"use client";

import { useEffect } from "react";

/**
 * Browsers restore the previous scroll position on a full page reload by
 * default ("scroll restoration"). On a long page like the homepage this
 * makes a refresh land mid-page instead of at the top, which — combined
 * with the fixed header — makes the hero look clipped/hidden. This opts
 * out of that restoration and forces a fresh load to start at the very
 * top, while still respecting a real anchor link (e.g. /#book) that was
 * clicked on purpose.
 */
export function ScrollRestoration() {
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    if (!window.location.hash) {
      window.scrollTo(0, 0);
    }
  }, []);

  return null;
}
