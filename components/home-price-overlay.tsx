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
  /** Horizontal nudge as % of card/overlay width (0 = centered). */
  x: number;
  cqh: number;
};

type LayoutMap = Record<CardKey, Record<LineKey, LineLayout>>;

type BoxGeom = {
  left: string;
  top: string;
  width: string;
  height: string;
};

/** Locked from desktop card DBUG Copy. */
const DESKTOP_LAYOUT: LayoutMap = {
  weekly: {
    amount: { top: 6.5, x: 0.9, cqh: 25.7 },
    unit: { top: 37.8, x: 1.5, cqh: 7 },
    title: { top: 53.7, x: 0.3, cqh: 8.2 },
    fee: { top: 69.4, x: -0.3, cqh: 6.5 },
  },
  ondemand: {
    amount: { top: 6.5, x: 0.9, cqh: 25.7 },
    unit: { top: 37.8, x: 1.5, cqh: 7 },
    title: { top: 51.1, x: 0.6, cqh: 8.2 },
    fee: { top: 76.3, x: 0.9, cqh: 6.5 },
  },
};

/** Locked from mobile card DBUG Copy. */
const MOBILE_LAYOUT: LayoutMap = {
  weekly: {
    amount: { top: 5.5, x: 0, cqh: 40 },
    unit: { top: 44.7, x: 0, cqh: 11.6 },
    title: { top: 60.7, x: 0, cqh: 16.4 },
    fee: { top: 80.8, x: 0, cqh: 10.8 },
  },
  ondemand: {
    amount: { top: 5.5, x: 0, cqh: 40 },
    unit: { top: 44.7, x: 0, cqh: 11.6 },
    title: { top: 59.8, x: -2.4, cqh: 16.4 },
    fee: { top: 80.8, x: 0, cqh: 10.8 },
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
    left: "20.04%",
    top: "9.29%",
    width: "59.93%",
    height: "19.44%",
  },
  ondemand: {
    left: "20.65%",
    top: "30.21%",
    width: "59%",
    height: "18.84%",
  },
};

/** Locked from desktop DBUG Copy. */
const DESKTOP_MIN_LAYOUT: LineLayout = {
  top: 70.3,
  x: -12.4,
  cqh: 3.4,
};

/** Locked from mobile DBUG Copy. */
const MOBILE_MIN_LAYOUT: LineLayout = {
  top: 77.5,
  x: -1.7,
  cqh: 2.6,
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
    <div
      className="home-price-free-line"
      style={{
        top: `${layout.top}%`,
        transform: layout.x ? `translateX(${layout.x}%)` : undefined,
      }}
    >
      <div className={className} style={{ fontSize: `${layout.cqh}cqh` }}>
        {children}
      </div>
    </div>
  );
}

function MinLine({
  layout,
  children,
}: {
  layout: LineLayout;
  children: ReactNode;
}) {
  return (
    <div
      className="home-price-min-line"
      data-line="minimum"
      style={{
        top: `${layout.top}%`,
        transform: layout.x ? `translateX(${layout.x}%)` : undefined,
      }}
    >
      <p className="home-price-min-text" style={{ fontSize: `${layout.cqh}cqh` }}>
        {children}
      </p>
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

  const ondemandTitle = singleLine ? (
    "Only When You Need Us"
  ) : (
    <>
      Only When
      <br />
      You Need Us
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
          "home-price-box-title is-nowrap",
          "Weekly Service"
        )}
        {line(
          "weekly",
          "fee",
          "home-price-box-fee is-nowrap",
          `+ $${money(rates.deliveryFee)} Service Fee per Pickup`
        )}
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
        {line(
          "ondemand",
          "fee",
          singleLine
            ? "home-price-box-fee is-nowrap"
            : "home-price-box-fee is-ink",
          feeText
        )}
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
      <MinLine layout={isMobile ? MOBILE_MIN_LAYOUT : DESKTOP_MIN_LAYOUT}>
        Minimum order total: ${money(rates.minimumOrder)}.
      </MinLine>
    </div>
  );
}
