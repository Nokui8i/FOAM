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
 * Positions from desktop debug drag (panel 4, %).
 * Boxes target digits only — baked "$" stays in the art to the left.
 * coverInsetL pushes the white mask right so it never eats the "$".
 * fontScale lifts Manrope glyph height to fill the debug box edge-to-edge.
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
    coverInsetL: number;
    fontScale: number;
  }
> = {
  weeklyBig: {
    left: 19.91,
    top: 23.54,
    width: 14.35,
    height: 10.68,
    // Match baked "$" / title ink on the navy card
    color: "#0A1548",
    weight: 800,
    coverInsetL: 1.15,
    fontScale: 1.28,
  },
  ondemandBig: {
    left: 48.03,
    top: 23.29,
    width: 14.71,
    height: 11.19,
    // Match baked "$" / "Only When You Need Us" on the blue card
    color: "#0875D0",
    weight: 800,
    coverInsetL: 1.2,
    fontScale: 1.28,
  },
  feeWeekly: {
    left: 15.63,
    top: 50.69,
    width: 3.98,
    height: 3.41,
    color: "#0A1548",
    weight: 700,
    // Fee DBUG left sits on/near "$" — start mask after it
    coverInsetL: 1.35,
    fontScale: 1.18,
  },
  feeOndemand: {
    left: 47.64,
    top: 53.44,
    width: 4.09,
    height: 3.51,
    color: "#0875D0",
    weight: 700,
    coverInsetL: 1.35,
    fontScale: 1.18,
  },
  minimum: {
    left: 56.8,
    top: 68.47,
    width: 5.05,
    height: 3.2,
    color: "#565656",
    weight: 700,
    coverInsetL: 0.55,
    fontScale: 1.15,
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
        const textLeft = slot.left + slot.coverInsetL;
        const textWidth = Math.max(slot.width - slot.coverInsetL, 1.5);
        // Debug box height × scale so Manrope digits fill top→bottom like the art.
        const fontPx =
          panelH > 0
            ? panelH * (slot.height / 100) * slot.fontScale
            : undefined;
        return (
          <div key={key}>
            <span
              className="home-price-cover"
              style={{
                left: `${textLeft}%`,
                top: `${slot.top - 0.1}%`,
                width: `${textWidth + 0.35}%`,
                height: `${slot.height + 0.35}%`,
              }}
            />
            <span
              className={`home-price-text is-${key}`}
              style={{
                left: `${textLeft}%`,
                top: `${slot.top}%`,
                width: `${textWidth}%`,
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
