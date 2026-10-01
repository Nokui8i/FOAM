"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { App as CapApp } from "@capacitor/app";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";

/**
 * Native shell chrome for Capacitor (Android + iOS).
 * No-ops in the browser / Firebase Hosting web build.
 */
export function CapacitorNativeBoot() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;

    async function boot() {
      try {
        // Customer site is light; dark status icons on a white bar.
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: "#ffffff" });
        if (Capacitor.getPlatform() === "android") {
          await StatusBar.setOverlaysWebView({ overlay: false });
        }
      } catch {
        // Plugin may be unavailable on some builds; ignore.
      }

      try {
        await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
      } catch {
        // iOS/Android keyboard resize modes differ; ignore failures.
      }

      try {
        // Let the live web UI paint before dismissing the native splash.
        await new Promise((r) => setTimeout(r, 400));
        if (!cancelled) await SplashScreen.hide({ fadeOutDuration: 280 });
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
      cancelled = true;
      void backSub.then((h) => h.remove());
    };
  }, []);

  return null;
}
