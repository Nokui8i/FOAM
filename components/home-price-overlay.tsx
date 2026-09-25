"use client";

import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_LAUNDRY_RATES,
  subscribeLaundryRates,
  type LaundryRates,
} from "@/lib/laundry-rates";

type Variant = "desktop" | "mobile";

/** Positions as % of the pricing panel box (desktop panel / mobile strip). */
const SLOTS: Record<
  Variant,
  Record<
    "weekly" | "ondemand" | "feeWeekly" | "feeOndemand" | "minimum",
    { left: number; top: number; font: number; color: string }
  >
> = {
  // Blank art cover-fit into 3840×2160 desktop panel.
  desktop: {
    weekly: { left: 19.9, top: 24.2, font: 0.082, color: "#0B1F3A" },
    ondemand: { left: 48.2, top: 24.2, font: 0.082, color: "#2F7AD1" },
    feeWeekly: { left: 14.5, top: 52.5, font: 0.0175, color: "#0B1F3A" },
    feeOndemand: { left: 46.3, top: 53.9, font: 0.0175, color: "#2F7AD1" },
    minimum: { left: 55.8, top: 64.8, font: 0.022, color: "#4A5568" },
  },
  // Blank letterboxed in mobile pricing band (810px art in 2308px strip).
  mobile: {
    weekly: { left: 19.9, top: 40.5, font: 0.029, color: "#0B1F3A" },
    ondemand: { left: 48.2, top: 40.5, font: 0.029, color: "#2F7AD1" },
    feeWeekly: { left: 14.5, top: 50.8, font: 0.0061, color: "#0B1F3A" },
    feeOndemand: { left: 46.3, top: 51.3, font: 0.0061, color: "#2F7AD1" },
    minimum: { left: 55.8, top: 55.2, font: 0.0077, color: "#4A5568" },
  },
};

function fmt(n: number) {
  return n.toFixed(2);
}

export function HomePriceOverlay({ variant }: { variant: Variant }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [rates, setRates] = useState<LaundryRates>(DEFAULT_LAUNDRY_RATES);
  const [panelH, setPanelH] = useState(0);

  useEffect(() => subscribeLaundryRates(setRates), []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setPanelH(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const slots = SLOTS[variant];
  const values = {
    weekly: fmt(rates.weeklyPerLb),
    ondemand: fmt(rates.standardPerLb),
    feeWeekly: `$${fmt(rates.deliveryFee)}`,
    feeOndemand: `$${fmt(rates.deliveryFee)}`,
    minimum: fmt(rates.minimumOrder),
  } as const;

  return (
    <div
      ref={rootRef}
      className={`home-price-overlay is-${variant}`}
      aria-hidden="true"
    >
      {(Object.keys(slots) as (keyof typeof slots)[]).map((key) => {
        const slot = slots[key];
        const fontPx = panelH > 0 ? panelH * slot.font : undefined;
        return (
          <span
            key={key}
            className={`home-price-text is-${key}`}
            style={{
              left: `${slot.left}%`,
              top: `${slot.top}%`,
              color: slot.color,
              fontSize: fontPx ? `${fontPx}px` : undefined,
            }}
          >
            {values[key]}
          </span>
        );
      })}
    </div>
  );
}
