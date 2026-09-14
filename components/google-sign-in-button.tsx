"use client";

import { useState } from "react";

import { useAuth } from "@/components/auth-provider";

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
      <svg
        viewBox="0 0 24 24"
        height="25"
        width="25"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        className="pointer-events-none"
      >
        <path
          d="M12,5c1.6167603,0,3.1012573,0.5535278,4.2863159,1.4740601l3.637146-3.4699707 C17.8087769,1.1399536,15.0406494,0,12,0C7.392395,0,3.3966675,2.5999146,1.3858032,6.4098511l4.0444336,3.1929321 C6.4099731,6.9193726,8.977478,5,12,5z"
          fill="#F44336"
        />
        <path
          d="M23.8960571,13.5018311C23.9585571,13.0101929,24,12.508667,24,12 c0-0.8578491-0.093689-1.6931763-0.2647705-2.5H12v5h6.4862061c-0.5247192,1.3637695-1.4589844,2.5177612-2.6481934,3.319458 l4.0594482,3.204834C22.0493774,19.135437,23.5219727,16.4903564,23.8960571,13.5018311z"
          fill="#2196F3"
        />
        <path
          d="M5,12c0-0.8434448,0.1568604-1.6483765,0.4302368-2.3972168L1.3858032,6.4098511 C0.5043335,8.0800171,0,9.9801636,0,12c0,1.9972534,0.4950562,3.8763428,1.3582153,5.532959l4.0495605-3.1970215 C5.1484375,13.6044312,5,12.8204346,5,12z"
          fill="#FFC107"
        />
        <path
          d="M12,19c-3.0455322,0-5.6295776-1.9484863-6.5922241-4.6640625L1.3582153,17.532959 C3.3592529,21.3734741,7.369812,24,12,24c3.027771,0,5.7887573-1.1248169,7.8974609-2.975708l-4.0594482-3.204834 C14.7412109,18.5588989,13.4284058,19,12,19z"
          fill="#00B060"
        />
      </svg>
      <span className="pointer-events-none ml-2">
        {busy ? busyLabel : label}
      </span>
    </button>
  );
}
