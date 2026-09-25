"use client";

import { useEffect, useState } from "react";

import {
  DEFAULT_LAUNDRY_RATES,
  formatRateUsd,
  subscribeLaundryRates,
  type LaundryRates,
} from "@/lib/laundry-rates";
import { cn } from "@/lib/utils";

export function HomePriceOverlay({
  variant,
}: {
  variant: "desktop" | "mobile";
}) {
  const [rates, setRates] = useState<LaundryRates>(DEFAULT_LAUNDRY_RATES);

  useEffect(() => subscribeLaundryRates(setRates), []);

  return (
    <div
      className={cn("home-price-overlay", `is-${variant}`)}
      aria-hidden="true"
    >
      <span className="home-price-cover is-weekly" />
      <span className="home-price-cover is-ondemand" />
      <span className="home-price-text is-weekly">
        {formatRateUsd(rates.weeklyPerLb)}
      </span>
      <span className="home-price-text is-ondemand">
        {formatRateUsd(rates.standardPerLb)}
      </span>
    </div>
  );
}
