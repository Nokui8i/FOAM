"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { App as CapApp } from "@capacitor/app";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";

function isStaffPath(pathname: string) {
  return (
    pathname.startsWith("/ops") ||
    pathname.startsWith("/driver") ||
    pathname.startsWith("/admin")
  );
}

/**
 * Native shell chrome for Capacitor (Android + iOS).
 * Splash art is handled by Android launch theme + OpsBoot BrandSplash —
 * do not stack Capacitor SplashScreen overlays (caused emulator glitches).
 */
export function CapacitorNativeBoot() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    async function boot() {
      const staff = isStaffPath(window.location.pathname);

      try {
        if (staff) {
          await StatusBar.setStyle({ style: Style.Light });
          await StatusBar.setBackgroundColor({ color: "#050505" });
        } else {
          await StatusBar.setStyle({ style: Style.Dark });
          await StatusBar.setBackgroundColor({ color: "#ffffff" });
        }
        if (Capacitor.getPlatform() === "android") {
          await StatusBar.setOverlaysWebView({ overlay: false });
        }
      } catch {
        // ignore
      }

      try {
        await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
      } catch {
        // ignore
      }
    }

    void boot();

    const backSub = CapApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        void CapApp.exitApp();
      }
    });

    return () => {
      void backSub.then((h) => h.remove());
    };
  }, []);

  return null;
}
