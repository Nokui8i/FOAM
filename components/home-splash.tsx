"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const MOBILE_SRC = "/home-mockup-mobile-v24.png";
const DESKTOP_SRC = "/home-mockup-desktop-v24.png";
const MIN_MS = 650;
const MAX_MS = 9000;
const EXIT_MS = 480;

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

function waitForImage(src: string) {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.decoding = "async";

    const finish = () => resolve();

    img.onload = () => {
      if (typeof img.decode === "function") {
        img.decode().then(finish).catch(finish);
      } else {
        finish();
      }
    };
    img.onerror = finish;
    img.src = src;

    if (img.complete && img.naturalWidth > 0) {
      if (typeof img.decode === "function") {
        img.decode().then(finish).catch(finish);
      } else {
        finish();
      }
    }
  });
}

export function HomeSplash() {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let startedExit = false;
    let exitTimer = 0;
    let hideTimer = 0;
    const started = performance.now();

    document.documentElement.classList.add("home-booting");

    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const heroSrc = isMobile ? MOBILE_SRC : DESKTOP_SRC;

    const beginExit = () => {
      if (cancelled || startedExit) return;
      startedExit = true;
      const remain = Math.max(0, MIN_MS - (performance.now() - started));
      exitTimer = window.setTimeout(() => {
        if (cancelled) return;
        setExiting(true);
        hideTimer = window.setTimeout(() => {
          if (cancelled) return;
          setVisible(false);
          document.documentElement.classList.remove("home-booting");
        }, EXIT_MS);
      }, remain);
    };

    const maxTimer = window.setTimeout(beginExit, MAX_MS);

    void waitForImage(heroSrc).then(beginExit);

    return () => {
      cancelled = true;
      window.clearTimeout(maxTimer);
      window.clearTimeout(exitTimer);
      window.clearTimeout(hideTimer);
      document.documentElement.classList.remove("home-booting");
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={cn("home-splash", exiting && "is-exiting")}
      aria-busy={!exiting}
      aria-live="polite"
      role="status"
    >
      <div className="home-splash-bubbles" aria-hidden="true">
        {BUBBLES.map((bubble, index) => (
          <span
            key={index}
            className="home-splash-bubble"
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
        className="home-splash-logo"
        src="/foam-ops-logo.png"
        alt="FOAM"
        width={217}
        height={72}
        draggable={false}
      />
      <span className="home-splash-sr">Loading FOAM…</span>
    </div>
  );
}
