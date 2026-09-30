"use client";

import { useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { GoogleGIcon } from "@/components/google-g-icon";

type Props = {
  className?: string;
  label?: string;
  busyLabel?: string;
  onError?: (message: string) => void;
};

/**
 * Tries a Firebase popup sign-in first (called synchronously from this
 * click handler so mobile Safari/Chrome treat it as a real user gesture),
 * falling back to a full-page redirect only if the browser actually blocks
 * or can't support a popup. See signInWithProvider in auth-provider.tsx.
 */
export function GoogleSignInButton({
  className,
  label = "Sign in with Google",
  busyLabel = "Signing in with Google…",
  onError,
}: Props) {
  const { signInGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    onError?.("");
    setBusy(true);
    try {
      await signInGoogle();
      // Page should navigate away to Google. If we're still here, unlock.
      window.setTimeout(() => setBusy(false), 4000);
    } catch (error) {
      setBusy(false);
      onError?.(
        error instanceof Error ? error.message : "Google sign-in failed."
      );
    }
  }

  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={() => {
        void handleClick();
      }}
    >
      <GoogleGIcon size={25} className="pointer-events-none" />
      <span className="pointer-events-none ml-2">
        {busy ? busyLabel : label}
      </span>
    </button>
  );
}
