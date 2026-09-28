"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { BrandSplash } from "@/components/brand-splash";

const MIN_MS = 520;
const MAX_MS = 8000;
const EXIT_MS = 450;

const OpsPageReadyContext = createContext<() => void>(() => {});

export function useMarkOpsPageReady() {
  return useContext(OpsPageReadyContext);
}

/** Signals first console page data is ready (ignored after initial boot). */
export function useOpsPageReadyWhen(ready: boolean) {
  const markReady = useMarkOpsPageReady();
  useEffect(() => {
    if (ready) markReady();
  }, [ready, markReady]);
}

export function OpsBootProvider({
  authReady,
  gateReady = true,
  consoleReady,
  children,
}: {
  authReady: boolean;
  /**
   * True once we know which gate to show after sign-in
   * (login form, pending, banned, or console). Keeps the splash up so
   * refresh never flashes a blank white page while staff profile loads.
   */
  gateReady?: boolean;
  /** True when signed-in admin/driver console is showing (not login / denied). */
  consoleReady: boolean;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const bootDoneRef = useRef(false);
  const generationRef = useRef(0);
  const startedAtRef = useRef(performance.now());
  const exitingRef = useRef(false);

  const beginExit = useCallback((permanent: boolean) => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    if (permanent) bootDoneRef.current = true;
    const gen = generationRef.current;
    const remain = Math.max(
      0,
      MIN_MS - (performance.now() - startedAtRef.current)
    );

    window.setTimeout(() => {
      if (gen !== generationRef.current) return;
      setExiting(true);
      window.setTimeout(() => {
        if (gen !== generationRef.current) return;
        setVisible(false);
        setExiting(false);
        document.documentElement.classList.remove("ops-booting");
      }, EXIT_MS);
    }, remain);
  }, []);

  const markReady = useCallback(() => {
    if (bootDoneRef.current) return;
    if (!consoleReady) return;
    beginExit(true);
  }, [beginExit, consoleReady]);

  useEffect(() => {
    if (bootDoneRef.current) return;

    if (!authReady || !gateReady) {
      document.documentElement.classList.add("ops-booting");
      generationRef.current += 1;
      startedAtRef.current = performance.now();
      exitingRef.current = false;
      setVisible(true);
      setExiting(false);
      return;
    }

    // Login / pending / banned / denied: reveal the gate UI.
    if (!consoleReady) {
      beginExit(false);
      return;
    }

    // First time entering the console — cover until page data is ready.
    generationRef.current += 1;
    const gen = generationRef.current;
    startedAtRef.current = performance.now();
    exitingRef.current = false;
    setVisible(true);
    setExiting(false);
    document.documentElement.classList.add("ops-booting");

    const maxTimer = window.setTimeout(() => {
      if (gen !== generationRef.current || bootDoneRef.current) return;
      beginExit(true);
    }, MAX_MS);

    return () => {
      window.clearTimeout(maxTimer);
    };
  }, [authReady, gateReady, consoleReady, beginExit]);

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove("ops-booting");
    };
  }, []);

  return (
    <OpsPageReadyContext.Provider value={markReady}>
      {children}
      {visible ? (
        <BrandSplash exiting={exiting} label="Loading OPS…" />
      ) : null}
    </OpsPageReadyContext.Provider>
  );
}
