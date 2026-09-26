"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  DEFAULT_LAUNDRY_RATES,
  subscribeLaundryRates,
  type LaundryRates,
} from "@/lib/laundry-rates";

type Variant = "desktop" | "mobile";
type CardKey = "weekly" | "ondemand";
type LineKey = "amount" | "unit" | "title" | "fee";

type LineLayout = {
  top: number;
  cqh: number;
};

type LayoutMap = Record<CardKey, Record<LineKey, LineLayout>>;

type BoxGeom = {
  left: string;
  top: string;
  width: string;
  height: string;
};

const DESKTOP_LAYOUT: LayoutMap = {
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

/** Locked from live mobile DBUG tuning (2026-09-26). */
const MOBILE_LAYOUT: LayoutMap = {
  weekly: {
    amount: { top: 1.9, cqh: 34.1 },
    unit: { top: 35.4, cqh: 11.6 },
    title: { top: 55.2, cqh: 11.6 },
    fee: { top: 76.6, cqh: 10.8 },
  },
  ondemand: {
    amount: { top: 1.9, cqh: 34.1 },
    unit: { top: 35.4, cqh: 11.6 },
    title: { top: 55.2, cqh: 11.6 },
    fee: { top: 76.6, cqh: 10.8 },
  },
};

const DESKTOP_BOXES: Record<CardKey, BoxGeom> = {
  weekly: {
    left: "8.33%",
    top: "19.86%",
    width: "26.28%",
    height: "48.52%",
  },
  ondemand: {
    left: "38.46%",
    top: "19.77%",
    width: "25.21%",
    height: "48.7%",
  },
};

const MOBILE_BOXES: Record<CardKey, BoxGeom> = {
  weekly: {
    left: "22.87%",
    top: "15.24%",
    width: "54.26%",
    height: "18.16%",
  },
  ondemand: {
    left: "23.43%",
    top: "34.79%",
    width: "53.43%",
    height: "17.6%",
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

function PriceCards({
  rates,
  layout,
  boxes,
  singleLine = false,
}: {
  rates: LaundryRates;
  layout: LayoutMap;
  boxes: Record<CardKey, BoxGeom>;
  singleLine?: boolean;
}) {
  const line = (
    card: CardKey,
    key: LineKey,
    className: string,
    content: ReactNode
  ) => (
    <FreeLine layout={layout[card][key]} className={className}>
      {content}
    </FreeLine>
  );

  const feeClass = singleLine
    ? "home-price-box-fee is-nowrap"
    : "home-price-box-fee";
  const ondemandTitle = singleLine ? (
    "Only When You Need Us"
  ) : (
    <>
      Only When You
      <br />
      Need Us
    </>
  );
  const feeText = singleLine ? (
    `+ $${money(rates.deliveryFee)} Service Fee per Pickup`
  ) : (
    <>
      + ${money(rates.deliveryFee)} Service Fee
      <br />
      per Pickup
    </>
  );

  return (
    <>
      <article className="home-price-box is-weekly" style={boxes.weekly}>
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
        {line(
          "weekly",
          "title",
          singleLine ? "home-price-box-title is-nowrap" : "home-price-box-title",
          "Weekly Service"
        )}
        {line("weekly", "fee", feeClass, feeText)}
      </article>

      <article className="home-price-box is-ondemand" style={boxes.ondemand}>
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
          singleLine ? "home-price-box-title is-nowrap" : "home-price-box-title",
          ondemandTitle
        )}
        {line("ondemand", "fee", feeClass, feeText)}
      </article>
    </>
  );
}

export function HomePriceOverlay({
  variant = "desktop",
}: {
  variant?: Variant;
}) {
  const [rates, setRates] = useState<LaundryRates>(DEFAULT_LAUNDRY_RATES);

  useEffect(() => subscribeLaundryRates(setRates), []);

  const isMobile = variant === "mobile";

  return (
    <div
      className={`home-price-overlay${isMobile ? " is-mobile" : ""}`}
      aria-hidden="true"
    >
      <PriceCards
        rates={rates}
        layout={isMobile ? MOBILE_LAYOUT : DESKTOP_LAYOUT}
        boxes={isMobile ? MOBILE_BOXES : DESKTOP_BOXES}
        singleLine={isMobile}
      />
    </div>
  );
}
