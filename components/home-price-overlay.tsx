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
    left: 16.55,
    top: 23.54,
    width: 17.7,
    height: 10.68,
    color: "#0A1548",
    weight: 800,
    fontScale: 1.52,
  },
  ondemandBig: {
    left: 44.7,
    top: 23.29,
    width: 18.05,
    height: 11.19,
    // Match "Only When You Need Us"
    color: "#1F82D6",
    weight: 800,
    fontScale: 1.52,
  },
  feeWeekly: {
    left: 15.55,
    top: 50.69,
    width: 4.15,
    height: 3.41,
    color: "#0A1548",
    weight: 700,
    fontScale: 1.28,
  },
  feeOndemand: {
    left: 47.55,
    top: 53.44,
    width: 4.25,
    height: 3.51,
    color: "#1F82D6",
    weight: 700,
    fontScale: 1.28,
  },
  minimum: {
    left: 55.9,
    top: 68.47,
    width: 5.9,
    height: 3.2,
    color: "#565656",
    weight: 700,
    fontScale: 1.22,
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
