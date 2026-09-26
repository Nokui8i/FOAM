"use client";

import { cn } from "@/lib/utils";

const BUBBLES = [
  { left: "8%", size: 10, delay: "0s", duration: "7.2s" },
  { left: "18%", size: 16, delay: "1.1s", duration: "8.4s" },
  { left: "28%", size: 8, delay: "2.4s", duration: "6.6s" },
  { left: "42%", size: 14, delay: "0.4s", duration: "9s" },
  { left: "55%", size: 11, delay: "3.1s", duration: "7.8s" },
  { left: "68%", size: 18, delay: "1.6s", duration: "8.8s" },
  { left: "78%", size: 9, delay: "2.8s", duration: "6.9s" },
  { left: "88%", size: 13, delay: "0.8s", duration: "7.5s" },
  { left: "12%", size: 7, delay: "4.2s", duration: "6.2s" },
  { left: "63%", size: 12, delay: "3.6s", duration: "8.1s" },
] as const;

export function BrandSplash({
  exiting = false,
  label = "Loading FOAM…",
  className,
}: {
  exiting?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("brand-splash", exiting && "is-exiting", className)}
      aria-busy={!exiting}
      aria-live="polite"
      role="status"
    >
      <div className="brand-splash-bubbles" aria-hidden="true">
        {BUBBLES.map((bubble, index) => (
          <span
            key={index}
            className="brand-splash-bubble"
            style={{
              left: bubble.left,
              width: bubble.size,
              height: bubble.size,
              animationDelay: bubble.delay,
              animationDuration: bubble.duration,
            }}
          />
        ))}
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="brand-splash-logo"
        src="/foam-ops-logo.png"
        alt="FOAM"
        width={217}
        height={72}
        draggable={false}
      />
      <span className="brand-splash-sr">{label}</span>
    </div>
  );
}
