"use client";

import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_LAUNDRY_RATES,
  subscribeLaundryRates,
  type LaundryRates,
} from "@/lib/laundry-rates";

type SlotKey =
  | "weeklyBig"
  | "ondemandBig"
  | "feeWeekly"
  | "feeOndemand"
  | "minimum";

/**
 * Digit boxes from desktop debug drag (panel 4, %), expanded left
 * so the live string includes "$". White is painted on the text itself
 * (no separate cover layer that can mask the currency glyph).
 */
const SLOTS: Record<
  SlotKey,
  {
    left: number;
    top: number;
    width: number;
    height: number;
    color: string;
    weight: number;
    fontScale: number;
  }
> = {
  weeklyBig: {
    // Pull left to bury baked "$" remnants, keep live "$2.35" inside
    left: 13.9,
    top: 23.2,
    width: 20.4,
    height: 11.2,
    color: "#0A1548",
    weight: 800,
    fontScale: 1.72,
  },
  ondemandBig: {
    left: 42.0,
    top: 22.95,
    width: 20.8,
    height: 11.7,
    // Match "Only When You Need Us"
    color: "#2183D4",
    weight: 800,
    fontScale: 1.72,
  },
  feeWeekly: {
    left: 15.2,
    top: 50.55,
    width: 4.35,
    height: 3.55,
    color: "#0A1548",
    weight: 700,
    fontScale: 1.35,
  },
  feeOndemand: {
    left: 47.2,
    top: 53.3,
    width: 4.45,
    height: 3.65,
    color: "#2183D4",
    weight: 700,
    fontScale: 1.35,
  },
  minimum: {
    left: 55.7,
    top: 68.35,
    width: 6.2,
    height: 3.35,
    color: "#565656",
    weight: 700,
    fontScale: 1.28,
  },
};

const SLOT_ORDER: SlotKey[] = [
  "weeklyBig",
  "ondemandBig",
  "feeWeekly",
  "feeOndemand",
  "minimum",
];

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export function HomePriceOverlay() {
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

  const values: Record<SlotKey, string> = {
    weeklyBig: money(rates.weeklyPerLb),
    ondemandBig: money(rates.standardPerLb),
    feeWeekly: money(rates.deliveryFee),
    feeOndemand: money(rates.deliveryFee),
    minimum: money(rates.minimumOrder),
  };

  return (
    <div ref={rootRef} className="home-price-overlay" aria-hidden="true">
      {SLOT_ORDER.map((key) => {
        const slot = SLOTS[key];
        const fontPx =
          panelH > 0
            ? panelH * (slot.height / 100) * slot.fontScale
            : undefined;
        return (
          <span
            key={key}
            className={`home-price-text is-${key}`}
            style={{
              left: `${slot.left}%`,
              top: `${slot.top}%`,
              width: `${slot.width}%`,
              height: `${slot.height}%`,
              color: slot.color,
              fontWeight: slot.weight,
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
