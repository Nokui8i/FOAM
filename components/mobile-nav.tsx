"use client";

import { ArrowRight, Menu, X } from "lucide-react";

import { BOOKING_PATH } from "@/lib/site-config";

const TOGGLE_ID = "foam-mobile-nav";

const LINKS = [
  { href: "/#services", label: "Services" },
  { href: "/#how", label: "How It Works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/dry-cleaning", label: "Dry Cleaning" },
  { href: "/specialty", label: "Specialty" },
  { href: "/guide", label: "Guide" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

/** Hamburger button — place inside the header */
export function MobileNavTrigger() {
  return (
    <label htmlFor={TOGGLE_ID} className="mn-trigger" aria-label="Open menu">
      <Menu size={28} strokeWidth={2.35} aria-hidden />
    </label>
  );
}

/**
 * Pure CSS drawer (checkbox hack). No client JS — works even when CSP blocks scripts.
 * Render once at the start of <body>.
 */
export function MobileNavDrawer() {
  return (
    <>
      <input id={TOGGLE_ID} type="checkbox" className="mn-check" />

      <div className="mn-root" role="presentation">
        <label
          htmlFor={TOGGLE_ID}
          className="mn-backdrop"
          aria-label="Close menu"
        />

        <aside className="mn-panel" aria-label="Menu">
          <div className="mn-top">
            <a href="/#top" className="wordmark">
              FOAM<span className="text-accent-strong">.</span>
            </a>
            <label
              htmlFor={TOGGLE_ID}
              className="mn-close"
              aria-label="Close menu"
            >
              <X size={20} aria-hidden />
            </label>
          </div>

          <nav className="mn-links" aria-label="Mobile navigation">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="mn-link"
                onClick={() => {
                  const toggle = document.getElementById(
                    TOGGLE_ID
                  ) as HTMLInputElement | null;
                  if (toggle) toggle.checked = false;
                }}
              >
                {link.label}
              </a>
            ))}
          </nav>

          <a
            href={BOOKING_PATH}
            className="mn-cta-btn"
            onClick={() => {
              const toggle = document.getElementById(
                TOGGLE_ID
              ) as HTMLInputElement | null;
              if (toggle) toggle.checked = false;
            }}
          >
            Schedule Pickup <ArrowRight size={16} aria-hidden />
          </a>
        </aside>
      </div>
    </>
  );
}
