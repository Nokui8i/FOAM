import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Specialty Pricing & Policies | FOAM",
  description:
    "FOAM specialty pricing — heavy soil, bulky items, stain care, rush delivery, bags, and service fees.",
};

type PriceRow = {
  name: string;
  price: string;
  note?: string;
};

type PolicySection = {
  id: string;
  title: string;
  intro?: string;
  rows: PriceRow[];
  footnotes?: string[];
};

const SECTIONS: PolicySection[] = [
  {
    id: "heavy-duty",
    title: "Heavy Duty / Commercial Orders",
    rows: [
      {
        name: "Heavy Soil / Commercial Laundry",
        price: "$4.75/lb",
        note:
          "For heavily soiled commercial items such as mop heads, shop towels, work rags, and industrial laundry.",
      },
      {
        name: "Heavily Soiled Item Fee",
        price: "$12/item",
        note: "Added to the standard per-pound price, for singular heavily soiled items.",
      },
      {
        name: "Heavy Soil Minimum",
        price: "$150 minimum order",
      },
    ],
    footnotes: [
      "We do not accept items contaminated with blood, feces, vomit, or hazardous waste.",
    ],
  },
  {
    id: "bulky",
    title: "Oversized Bedding — Bulky Item Surcharge",
    intro:
      "To ensure proper washing, drying, and handling, the following additional fees apply:",
    rows: [
      { name: "Duvets (any size)", price: "+$10 each" },
      {
        name: "Medium, large, or extra-thick blankets",
        price: "+$10 each",
      },
      { name: "Mattress toppers", price: "+$20 each" },
      { name: "Pet beds", price: "+$20 each" },
      {
        name: "Other oversized or bulky items",
        price: "Fees may vary",
        note: "Based on size and material.",
      },
    ],
    footnotes: [
      "All fees are added to the weighed per-pound price for each specific item.",
    ],
  },
  {
    id: "specialty-care",
    title: "Specialty Care",
    rows: [
      {
        name: "Stain Removal",
        price: "$3.99/stain",
        note:
          'Place stained items in a separate bag and label it "Stains" before pickup.',
      },
      {
        name: "Excess Debris Removal Fee",
        price: "$10–$35+",
        note:
          "Orders with unusual amounts of trash or debris before processing may incur a labor fee based on time required.",
      },
    ],
    footnotes: [
      "No charge — Normal lint, an occasional tissue, or a few small items.",
      "$10 — Moderate trash or debris that adds several minutes of cleanup.",
      "$20 — Excessive debris requiring significant sorting and cleanup before processing.",
      "$35+ — Extreme cases (bags of trash mixed with laundry, biohazards, or conditions that need extensive cleaning). In some cases we may refuse service.",
    ],
  },
  {
    id: "same-day",
    title: "Same Day Delivery & Bags",
    rows: [
      {
        name: "Same Day Delivery",
        price: "$10",
        note:
          "Available for orders under 75 lbs total. Include a note with your order, or message us before pickup day.",
      },
      {
        name: "Rush Delivery",
        price: "$10",
        note:
          "For large bulk orders over 100 lbs that specifically request 24-hour turnaround.",
      },
      {
        name: "FOAM Laundry Bags",
        price: "$10 each",
        note: "Message us to purchase with your order.",
      },
    ],
  },
  {
    id: "policies",
    title: "Delivery & Service Policies",
    rows: [
      {
        name: "Missed Pickup Fee",
        price: "$17",
        note:
          "May also apply if pickup is not cancelled at least 3 hours before pickup time.",
      },
      {
        name: "Unprocessed Order Return Fee",
        price: "$22",
      },
      {
        name: "Late Charging Fee",
        price: "$10",
        note:
          "May apply after more than 3 unsuccessful attempts to contact for payment.",
      },
      {
        name: "Out-of-Route Delivery Fee",
        price: "$10",
        note:
          "May apply when an order cannot be delivered on its original scheduled route and needs a separate trip.",
      },
      {
        name: "Early Subscription Cancellation",
        price: "$17",
        note:
          "If pickups are canceled before 5 repeat orders are completed within a year of the initial repeat sign-up.",
      },
    ],
    footnotes: [
      "If pickups are repeatedly skipped before 5 pickups are completed in a year, an Early Subscription Cancellation fee will be applied and your repeats will be cancelled for inactivity.",
    ],
  },
];

export default function SpecialtyPricingPage() {
  return (
    <main className="overflow-hidden bg-background text-foreground selection:bg-accent">
      <SiteHeader />

      <section className="dc-hero" aria-label="Specialty Pricing">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/foam-specialty-hero.png"
          alt="FOAM Specialty Pricing — additional fees and policies for heavy soil, bulky items, specialty care, and delivery."
          width={1800}
          height={900}
          className="dc-hero-image"
        />
      </section>

      <section className="sp-section" aria-label="Specialty pricing details">
        <div className="site-shell">
          <div className="sp-stack">
            {SECTIONS.map((section) => (
              <article key={section.id} className="sp-block">
                <h2 className="sp-block-title">{section.title}</h2>
                {section.intro ? (
                  <p className="sp-block-intro">{section.intro}</p>
                ) : null}

                <ul className="sp-price-list">
                  {section.rows.map((row) => (
                    <li key={row.name} className="sp-price-row">
                      <div className="sp-price-main">
                        <span className="sp-price-name">{row.name}</span>
                        <span className="sp-price-value">{row.price}</span>
                      </div>
                      {row.note ? (
                        <p className="sp-price-note">{row.note}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>

                {section.footnotes?.length ? (
                  <ul className="sp-footnotes">
                    {section.footnotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
