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

/** Call once when the active OPS page has its first data paint. */
export function useOpsPageReadyWhen(ready: boolean) {
  const markReady = useMarkOpsPageReady();
  useEffect(() => {
    if (ready) markReady();
  }, [ready, markReady]);
}

export function OpsBootProvider({
  authReady,
  consoleReady,
  pageKey,
  children,
}: {
  authReady: boolean;
  /** True when signed-in admin console is showing (not login / denied). */
  consoleReady: boolean;
  pageKey: string;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const generationRef = useRef(0);
  const startedAtRef = useRef(performance.now());
  const exitingRef = useRef(false);

  const beginExit = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    const gen = generationRef.current;
    const remain = Math.max(0, MIN_MS - (performance.now() - startedAtRef.current));

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
    beginExit();
  }, [beginExit]);

  useEffect(() => {
    generationRef.current += 1;
    const gen = generationRef.current;
    startedAtRef.current = performance.now();
    exitingRef.current = false;
    setVisible(true);
    setExiting(false);
    document.documentElement.classList.add("ops-booting");

    if (!authReady) return;

    // Login / access-denied screens: splash only until auth resolves.
    if (!consoleReady) {
      beginExit();
      return;
    }

    const maxTimer = window.setTimeout(() => {
      if (gen !== generationRef.current) return;
      beginExit();
    }, MAX_MS);

    return () => {
      window.clearTimeout(maxTimer);
    };
  }, [authReady, consoleReady, pageKey, beginExit]);

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
