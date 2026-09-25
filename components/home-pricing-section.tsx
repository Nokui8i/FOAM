"use client";

import { useEffect, useState } from "react";
import { Heart, Leaf, MapPin, Sparkles } from "lucide-react";

import {
  DEFAULT_LAUNDRY_RATES,
  subscribeLaundryRates,
  type LaundryRates,
} from "@/lib/laundry-rates";

const PERKS = [
  {
    icon: Leaf,
    title: "Professional Care",
    copy: "Your clothes are in good hands.",
  },
  {
    icon: MapPin,
    title: "Las Vegas Local",
    copy: "Proudly serving the Las Vegas Valley.",
  },
  {
    icon: Heart,
    title: "More Free Time",
    copy: "For what really matters.",
  },
  {
    icon: Sparkles,
    title: "Fresh Results",
    copy: "Clean clothes. A brighter you.",
  },
] as const;

function money(n: number) {
  return n.toFixed(2);
}

export function HomePricingSection() {
  const [rates, setRates] = useState<LaundryRates>(DEFAULT_LAUNDRY_RATES);

  useEffect(() => subscribeLaundryRates(setRates), []);

  return (
    <section
      id="pricing"
      className="home-pricing"
      aria-label="Simple pricing"
    >
      <div className="home-pricing-fade home-pricing-fade--top" aria-hidden="true" />
      <div className="home-pricing-inner">
        <header className="home-pricing-header">
          <p className="home-pricing-kicker">Simple Pricing</p>
          <h2 className="home-pricing-title">These are the prices.</h2>
        </header>

        <div className="home-pricing-stage">
          <div className="home-pricing-cards">
            <article className="home-pricing-card is-weekly">
              <p className="home-pricing-rate">
                <span className="home-pricing-dollar">$</span>
                <span className="home-pricing-amount">
                  {money(rates.weeklyPerLb)}
                </span>
              </p>
              <p className="home-pricing-unit">per pound</p>
              <h3 className="home-pricing-plan">Weekly Service</h3>
              <p className="home-pricing-fee">
                + ${money(rates.deliveryFee)} Service Fee per Pickup
              </p>
            </article>

            <article className="home-pricing-card is-ondemand">
              <p className="home-pricing-rate">
                <span className="home-pricing-dollar">$</span>
                <span className="home-pricing-amount">
                  {money(rates.standardPerLb)}
                </span>
              </p>
              <p className="home-pricing-unit">per pound</p>
              <h3 className="home-pricing-plan">Only When You Need Us</h3>
              <p className="home-pricing-fee">
                + ${money(rates.deliveryFee)} Service Fee per Pickup
              </p>
            </article>
          </div>

          <div className="home-pricing-mascot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/home-pricing-koala.png"
              alt=""
              width={619}
              height={602}
            />
          </div>
        </div>

        <p className="home-pricing-minimum">
          Minimum order total: ${money(rates.minimumOrder)}.
        </p>

        <ul className="home-pricing-perks">
          {PERKS.map(({ icon: Icon, title, copy }) => (
            <li key={title} className="home-pricing-perk">
              <Icon aria-hidden="true" />
              <div>
                <strong>{title}</strong>
                <span>{copy}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="home-pricing-fade home-pricing-fade--bottom" aria-hidden="true" />
    </section>
  );
}
