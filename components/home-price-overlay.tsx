"use client";

import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_LAUNDRY_RATES,
  formatRateUsd,
  subscribeLaundryRates,
  type LaundryRates,
} from "@/lib/laundry-rates";
import { cn } from "@/lib/utils";

type SlotKey = "weekly" | "ondemand" | "feeWeekly" | "feeOndemand" | "minimum";

/** Fraction of the pricing panel height → font-size (matches mockup glyph height). */
const FONT_RATIO: Record<"desktop" | "mobile", Partial<Record<SlotKey, number>>> = {
  desktop: {
    weekly: 0.069,
    ondemand: 0.068,
    feeWeekly: 0.0175,
    feeOndemand: 0.0175,
    minimum: 0.0165,
  },
  mobile: {
    weekly: 0.078,
    ondemand: 0.078,
    feeWeekly: 0.022,
    feeOndemand: 0.022,
    minimum: 0.02,
  },
};

export function HomePriceOverlay({
  variant,
}: {
  variant: "desktop" | "mobile";
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [rates, setRates] = useState<LaundryRates>(DEFAULT_LAUNDRY_RATES);
  const [panelH, setPanelH] = useState(0);

  useEffect(() => subscribeLaundryRates(setRates), []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const sync = () => setPanelH(el.clientHeight);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function size(key: SlotKey) {
    const ratio = FONT_RATIO[variant][key] ?? 0.06;
    if (!(panelH > 0)) return undefined;
    return `${Math.max(10, panelH * ratio)}px`;
  }

  return (
    <div
      ref={rootRef}
      className={cn("home-price-overlay", `is-${variant}`)}
      aria-hidden="true"
    >
      <span className="home-price-cover is-weekly" />
      <span className="home-price-cover is-ondemand" />
      <span className="home-price-cover is-fee-weekly" />
      <span className="home-price-cover is-fee-ondemand" />
      <span className="home-price-cover is-minimum" />

      <span className="home-price-text is-weekly" style={{ fontSize: size("weekly") }}>
        {formatRateUsd(rates.weeklyPerLb)}
      </span>
      <span
        className="home-price-text is-ondemand"
        style={{ fontSize: size("ondemand") }}
      >
        {formatRateUsd(rates.standardPerLb)}
      </span>
      <span
        className="home-price-text is-fee-weekly"
        style={{ fontSize: size("feeWeekly") }}
      >
        {formatRateUsd(rates.deliveryFee)}
      </span>
      <span
        className="home-price-text is-fee-ondemand"
        style={{ fontSize: size("feeOndemand") }}
      >
        {formatRateUsd(rates.deliveryFee)}
      </span>
      <span
        className="home-price-text is-minimum"
        style={{ fontSize: size("minimum") }}
      >
        {formatRateUsd(rates.minimumOrder)}
      </span>
    </div>
  );
}
