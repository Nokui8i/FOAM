"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  DEFAULT_LAUNDRY_RATES,
  subscribeLaundryRates,
  type LaundryRates,
} from "@/lib/laundry-rates";

type CardKey = "weekly" | "ondemand";
type LineKey = "amount" | "unit" | "title" | "fee";

type LineLayout = {
  top: number;
  cqh: number;
};

type LayoutMap = Record<CardKey, Record<LineKey, LineLayout>>;

/** Locked from live tuning (2026-09-26). */
const LAYOUT: LayoutMap = {
  weekly: {
    amount: { top: 6.5, cqh: 22.6 },
    unit: { top: 33, cqh: 7 },
    title: { top: 47.3, cqh: 8.2 },
    fee: { top: 69.2, cqh: 6.5 },
  },
  ondemand: {
    amount: { top: 6.5, cqh: 22.6 },
    unit: { top: 33, cqh: 7 },
    title: { top: 46, cqh: 8.2 },
    fee: { top: 69.2, cqh: 6.5 },
  },
};

function money(n: number) {
  return n.toFixed(2);
}

function FreeLine({
  layout,
  className,
  children,
}: {
  layout: LineLayout;
  className: string;
  children: ReactNode;
}) {
  return (
    <div className="home-price-free-line" style={{ top: `${layout.top}%` }}>
      <div className={className} style={{ fontSize: `${layout.cqh}cqh` }}>
        {children}
      </div>
    </div>
  );
}

export function HomePriceOverlay() {
  const [rates, setRates] = useState<LaundryRates>(DEFAULT_LAUNDRY_RATES);

  useEffect(() => subscribeLaundryRates(setRates), []);

  const line = (
    card: CardKey,
    key: LineKey,
    className: string,
    content: ReactNode
  ) => (
    <FreeLine layout={LAYOUT[card][key]} className={className}>
      {content}
    </FreeLine>
  );

  return (
    <div className="home-price-overlay" aria-hidden="true">
      <article
        className="home-price-box is-weekly"
        style={{
          left: "8.33%",
          top: "19.86%",
          width: "26.28%",
          height: "48.52%",
        }}
      >
        {line(
          "weekly",
          "amount",
          "home-price-box-amount",
          <>
            <span className="home-price-box-dollar">$</span>
            {money(rates.weeklyPerLb)}
          </>
        )}
        {line("weekly", "unit", "home-price-box-unit", "per pound")}
        {line("weekly", "title", "home-price-box-title", "Weekly Service")}
        {line(
          "weekly",
          "fee",
          "home-price-box-fee is-nowrap",
          `+ $${money(rates.deliveryFee)} Service Fee per Pickup`
        )}
      </article>

      <article
        className="home-price-box is-ondemand"
        style={{
          left: "38.46%",
          top: "19.77%",
          width: "25.21%",
          height: "48.7%",
        }}
      >
        {line(
          "ondemand",
          "amount",
          "home-price-box-amount",
          <>
            <span className="home-price-box-dollar">$</span>
            {money(rates.standardPerLb)}
          </>
        )}
        {line("ondemand", "unit", "home-price-box-unit", "per pound")}
        {line(
          "ondemand",
          "title",
          "home-price-box-title",
          <>
            Only When You
            <br />
            Need Us
          </>
        )}
        {line(
          "ondemand",
          "fee",
          "home-price-box-fee",
          <>
            + ${money(rates.deliveryFee)} Service Fee
            <br />
            per Pickup
          </>
        )}
      </article>
    </div>
  );
}
