import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Dry Cleaning | FOAM",
  description:
    "FOAM dry cleaning — transparent per-item pricing, pickup and delivery, specialist care for garments that need more than wash & fold.",
};

type PriceRow = { name: string; price: string };

const PRICE_CATEGORIES: {
  id: string;
  title: string;
  rows: PriceRow[];
}[] = [
  {
    id: "minimums",
    title: "Dry Cleaning Minimum Orders",
    rows: [
      {
        name: "Dry Cleaning (Add on)",
        price: "$25 minimum when added to your laundry order",
      },
      {
        name: "Dry Cleaning Only",
        price: "Our standard $50 minimum",
      },
    ],
  },
  {
    id: "tops",
    title: "Tops",
    rows: [
      { name: "Blouse", price: "$6.55" },
      { name: "Blouse (linen)", price: "$7.55" },
      { name: "Coat", price: "$12.25" },
      { name: "Jacket (down)", price: "$15.00" },
      { name: "Jacket (leather)", price: "$75.00" },
      { name: "Jacket (sport/outer)", price: "$10.00" },
      { name: "Jacket (womens)", price: "$7.50" },
      { name: "Jersey", price: "$8.50" },
      { name: "Laundry Shirt", price: "$3.95" },
      { name: "Long Heavy Coat", price: "$20.00" },
      { name: "Outer Vest", price: "$10.00" },
      { name: "Polo/T-shirt", price: "$6.55" },
      { name: "Romper", price: "$12.00" },
      { name: "Shirt", price: "$6.55" },
      { name: "Shirt (linen)", price: "$7.55" },
      { name: "Sweater", price: "$6.75" },
      { name: "Sweater (fur)", price: "$10.00" },
      { name: "Sweatshirt", price: "$8.00" },
      { name: "Tommy Bahama Shirt", price: "$7.55" },
      { name: "Vest", price: "$5.00" },
      { name: "Windbreaker", price: "$10.00" },
    ],
  },
  {
    id: "bottoms",
    title: "Bottoms",
    rows: [
      { name: "Pants", price: "$6.55" },
      { name: "Pants (beaded)", price: "$14.00" },
      { name: "Pants (leather)", price: "$15.00" },
      { name: "Pants (linen)", price: "$7.55" },
      { name: "Shorts", price: "$6.25" },
      { name: "Shorts (linen)", price: "$7.25" },
      { name: "Skirt (short)", price: "$9.50" },
      { name: "Skirt (long)", price: "$10.00" },
    ],
  },
  {
    id: "full-body",
    title: "Full Body",
    rows: [
      { name: "2-piece suit", price: "$14.55" },
      { name: "3-piece suit", price: "$18.55" },
      { name: "Dress (short)", price: "$12.00" },
      { name: "Dress (long)", price: "$17.00" },
      { name: "Gown", price: "$25.00" },
      { name: "Jumpsuit", price: "$16.00" },
      { name: "Romper", price: "$12.00" },
    ],
  },
  {
    id: "accessories",
    title: "Accessories",
    rows: [
      { name: "Belt", price: "$1.50" },
      { name: "Hanky", price: "$1.50" },
      { name: "Banquet Tablecloth", price: "$25.00" },
      { name: "Large Tablecloth", price: "$16.00" },
      { name: "Napkins", price: "$3.00 each" },
      { name: "Placemats", price: "$5.00 each" },
      { name: "Pillowcases", price: "$5.00 each" },
      { name: "Tablecloth", price: "$12.00" },
      { name: "Tie", price: "$4.50" },
      { name: "Veil", price: "$15.00" },
    ],
  },
  {
    id: "household",
    title: "Household / Bedding",
    rows: [
      { name: "Blanket", price: "$25.00" },
      { name: "Comforter", price: "$40.00" },
      { name: "Comforter (NS)", price: "$60.00" },
      { name: "Curtain Panels", price: "$50.00" },
      { name: "Duvet Comforter", price: "$25.00" },
      { name: "Down Comforter", price: "$45.00" },
      { name: "Pillowcase", price: "$5.00 each" },
      { name: "Top/Bottom Sheet", price: "$15.00" },
    ],
  },
];

export default function DryCleaningPage() {
  return (
    <main className="overflow-hidden bg-background text-foreground selection:bg-accent">
      <SiteHeader />

      <section className="dc-hero" aria-label="Dry Cleaning">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/foam-dry-cleaning-hero.png"
          alt="FOAM Dry Cleaning — pressed garments on a rack, ready for pickup and delivery."
          width={1800}
          height={900}
          className="dc-hero-image"
        />
      </section>

      <section className="dc-pricing-section" aria-label="Dry cleaning pricing">
        <div className="site-shell">
          <div className="dc-pricing-header">
            <p className="eyebrow">Pricing</p>
            <h1 className="dc-pricing-title">Dry Cleaning</h1>
            <p className="section-copy">
              Specialist care, priced per item. Add dry cleaning to a laundry
              order or book it on its own.
            </p>
          </div>

          <div className="dc-accordion">
            {PRICE_CATEGORIES.map((category, index) => (
              <details
                key={category.id}
                className="dc-accordion-item"
                open={index === 0}
              >
                <summary className="dc-accordion-trigger">
                  {category.title}
                </summary>
                <ul className="dc-price-list">
                  {category.rows.map((row) => (
                    <li key={row.name} className="dc-price-row">
                      <span>{row.name}</span>
                      <span className="dc-price-value">{row.price}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
