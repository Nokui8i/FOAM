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
 * so the live string includes the "$" (no reliance on baked "$").
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
    /** Manrope digit height vs em-square — scale so glyphs fill the debug box. */
    fontScale: number;
  }
> = {
  weeklyBig: {
    // digit box 19.91×14.35 → pull left over baked "$"
    left: 16.55,
    top: 23.54,
    width: 17.7,
    height: 10.68,
    color: "#0A1548",
    weight: 800,
    fontScale: 1.32,
  },
  ondemandBig: {
    left: 44.7,
    top: 23.29,
    width: 18.05,
    height: 11.19,
    // Match "Only When You Need Us" / card ink
    color: "#1876CA",
    weight: 800,
    fontScale: 1.32,
  },
  feeWeekly: {
    // original 15.63 already sits on/near "$5.00"
    left: 14.85,
    top: 50.69,
    width: 4.85,
    height: 3.41,
    color: "#0A1548",
    weight: 700,
    fontScale: 1.2,
  },
  feeOndemand: {
    left: 46.85,
    top: 53.44,
    width: 5.0,
    height: 3.51,
    color: "#1876CA",
    weight: 700,
    fontScale: 1.2,
  },
  minimum: {
    left: 55.55,
    top: 68.47,
    width: 6.4,
    height: 3.2,
    color: "#565656",
    weight: 700,
    fontScale: 1.18,
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
          <div key={key}>
            <span
              className="home-price-cover"
              style={{
                left: `${slot.left - 0.15}%`,
                top: `${slot.top - 0.2}%`,
                width: `${slot.width + 0.5}%`,
                height: `${slot.height + 0.5}%`,
              }}
            />
            <span
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
          </div>
        );
      })}
    </div>
  );
}
