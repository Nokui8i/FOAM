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
 * Locked from the user's desktop DBUG drag — do not shift these boxes.
 * Digits only; baked "$" sits immediately to the left of each box.
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
  }
> = {
  weeklyBig: {
    left: 19.91,
    top: 23.54,
    width: 14.35,
    height: 10.68,
    color: "#0A1548",
    weight: 800,
  },
  ondemandBig: {
    left: 48.03,
    top: 23.29,
    width: 14.71,
    height: 11.19,
    color: "#1080E0",
    weight: 800,
  },
  feeWeekly: {
    left: 15.63,
    top: 50.69,
    width: 3.98,
    height: 3.41,
    color: "#0A1548",
    weight: 700,
  },
  feeOndemand: {
    left: 47.64,
    top: 53.44,
    width: 4.09,
    height: 3.51,
    color: "#1080E0",
    weight: 700,
  },
  minimum: {
    left: 56.8,
    top: 68.47,
    width: 5.05,
    height: 3.2,
    color: "#565656",
    weight: 700,
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
        // DBUG height = exact glyph height (top → bottom of the box).
        const fontPx =
          panelH > 0 ? panelH * (slot.height / 100) : undefined;
        return (
          <div key={key}>
            {/*
              White mask sits on the DBUG rect only.
              Never expand left — that eats the baked "$".
            */}
            <span
              className="home-price-cover"
              style={{
                left: `${slot.left}%`,
                top: `${slot.top}%`,
                width: `${slot.width}%`,
                height: `${slot.height}%`,
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
