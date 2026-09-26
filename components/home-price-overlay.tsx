"use client";

import { useEffect, useState } from "react";

import {
  DEFAULT_LAUNDRY_RATES,
  subscribeLaundryRates,
  type LaundryRates,
} from "@/lib/laundry-rates";

function money(n: number) {
  return n.toFixed(2);
}

export function HomePriceOverlay() {
  const [rates, setRates] = useState<LaundryRates>(DEFAULT_LAUNDRY_RATES);

  useEffect(() => subscribeLaundryRates(setRates), []);

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
        <p className="home-price-box-amount">
          <span className="home-price-box-dollar">$</span>
          {money(rates.weeklyPerLb)}
        </p>
        <p className="home-price-box-unit">per pound</p>
        <h3 className="home-price-box-title">Weekly Service</h3>
        <p className="home-price-box-fee">
          + ${money(rates.deliveryFee)} Service Fee per Pickup
        </p>
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
        <p className="home-price-box-amount">
          <span className="home-price-box-dollar">$</span>
          {money(rates.standardPerLb)}
        </p>
        <p className="home-price-box-unit">per pound</p>
        <h3 className="home-price-box-title">
          Only When You
          <br />
          Need Us
        </h3>
        <p className="home-price-box-fee">
          + ${money(rates.deliveryFee)} Service Fee
          <br />
          per Pickup
        </p>
      </article>
    </div>
  );
}
