"use client";

import { useEffect, useState } from "react";

import { BrandSplash } from "@/components/brand-splash";

const MOBILE_SRC = "/home-mockup-mobile-v24.png";
const DESKTOP_SRC = "/home-mockup-desktop-v24.png";
const MIN_MS = 650;
const MAX_MS = 9000;
const EXIT_MS = 480;

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

  return <BrandSplash exiting={exiting} label="Loading FOAM…" />;
}
