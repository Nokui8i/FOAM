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
 * Exact desktop debug-drag boxes (panel 4, %).
 * Digits only — baked "$" stays in the art.
 * White is the text chip's own background; insetL keeps it off the "$".
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
    insetL: number;
    fontScale: number;
  }
> = {
  feeWeekly: {
    // Start after baked "$"; keep width to digits only so we don't cover "Service"
    left: 17.05,
    top: 50.69,
    width: 2.7,
    height: 3.41,
    color: "#0A1548",
    weight: 700,
    insetL: 0,
    fontScale: 1.15,
  },
  feeOndemand: {
    left: 48.95,
    top: 53.44,
    width: 2.8,
    height: 3.51,
    color: "#2183D4",
    weight: 700,
    insetL: 0,
    fontScale: 1.15,
  },
  weeklyBig: {
    left: 19.91,
    top: 23.54,
    width: 14.35,
    height: 10.68,
    color: "#0A1548",
    weight: 800,
    insetL: 0.55,
    fontScale: 1.55,
  },
  ondemandBig: {
    left: 48.03,
    top: 23.29,
    width: 14.71,
    height: 11.19,
    color: "#2183D4",
    weight: 800,
    insetL: 0.6,
    fontScale: 1.55,
  },
  minimum: {
    left: 56.8,
    top: 68.47,
    width: 5.05,
    height: 3.2,
    color: "#565656",
    weight: 700,
    insetL: 0.45,
    fontScale: 1.25,
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
  return n.toFixed(2);
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
        const left = slot.left + slot.insetL;
        const width = Math.max(slot.width - slot.insetL, 1.2);
        const fontPx =
          panelH > 0
            ? panelH * (slot.height / 100) * slot.fontScale
            : undefined;
        return (
          <span
            key={key}
            className={`home-price-text is-${key}`}
            style={{
              left: `${left}%`,
              top: `${slot.top}%`,
              width: `${width}%`,
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
