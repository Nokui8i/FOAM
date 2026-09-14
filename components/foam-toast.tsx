"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type ToastProps = {
  message: string;
  tone?: "error" | "info";
  onClose: () => void;
  /** Auto-dismiss after ms. 0 = stay until closed. */
  durationMs?: number;
};

/**
 * Lightweight FOAM toast — no third-party lib.
 * Fixed above the thumb zone on mobile; doesn't push the login form layout.
 */
export function FoamToast({
  message,
  tone = "error",
  onClose,
  durationMs = 6500,
}: ToastProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!message || durationMs <= 0) return;
    const id = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(id);
  }, [message, durationMs, onClose]);

  if (!mounted || !message) return null;

  return createPortal(
    <div
      className={`foam-toast foam-toast--${tone}`}
      role="alert"
      aria-live="assertive"
    >
      <p className="foam-toast-text">{message}</p>
      <button
        type="button"
        className="foam-toast-close"
        aria-label="Dismiss"
        onClick={onClose}
      >
        <X size={16} aria-hidden />
      </button>
    </div>,
    document.body
  );
}
