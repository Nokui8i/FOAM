import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "About Us | FOAM",
  description:
    "FOAM is a laundry pickup and delivery service built for clean standards, clear care, and more time for what matters.",
};

export default function AboutPage() {
  return (
    <main className="overflow-hidden bg-background text-foreground selection:bg-accent">
      <SiteHeader />

      <section className="dc-hero" aria-label="About FOAM">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/foam-about-hero.png"
          alt="About FOAM — laundry pickup and delivery, handled with care."
          width={1800}
          height={900}
          className="dc-hero-image"
        />
      </section>

      <section className="about-section" aria-label="About FOAM">
        <div className="site-shell">
          <div className="about-stack">
            <p>
              FOAM is a laundry pickup and delivery service built around one
              idea: your time is better spent elsewhere.
            </p>
            <p>
              We pick up, wash, fold, and bring everything back — clean,
              consistent, and ready to put away. No sorting marathon. No weekend
              lost to laundry. Just a simple handoff at your door.
            </p>
            <p>
              Your order is handled in a professional facility by a trained
              team, with clear preferences and careful attention to how you like
              things done. We don&rsquo;t outsource to random gig workers. We
              keep the process controlled, clean, and accountable.
            </p>
            <p>
              Whether it&rsquo;s weekly wash &amp; fold, dry cleaning, or both
              in one pickup, FOAM is designed to feel easy from the first bag to
              the last delivery.
            </p>
            <p className="about-mission">
              Less laundry on your mind. More life in your day. That&rsquo;s
              FOAM.
            </p>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
