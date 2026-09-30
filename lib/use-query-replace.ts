"use client";

import { useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Update query params without scrolling; pass null to remove a key. */
export function useQueryReplace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const replaceQuery = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      // Prefer the live URL so back-to-back replaces don't restore
      // keys from a stale useSearchParams snapshot.
      const live =
        typeof window !== "undefined"
          ? window.location.search.replace(/^\?/, "")
          : searchParamsRef.current.toString();
      const next = new URLSearchParams(live);
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      const current =
        typeof window !== "undefined"
          ? window.location.search.replace(/^\?/, "")
          : searchParamsRef.current.toString();
      if (qs === current) return;
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router]
  );

  return { searchParams, replaceQuery, pathname };
}
