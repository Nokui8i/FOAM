import type { Metadata } from "next";

import { DryCleaningPricingList } from "@/components/dry-cleaning-pricing-list";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Dry Cleaning | FOAM",
  description:
    "FOAM dry cleaning — transparent per-item pricing, pickup and delivery, specialist care for garments that need more than wash & fold.",
};

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

          <DryCleaningPricingList />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
