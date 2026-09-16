import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BOOKING_PATH } from "@/lib/site-config";

export default function Home() {
  return (
    <main className="overflow-hidden bg-background text-foreground selection:bg-accent">
      <SiteHeader />

      <section id="top" className="pb-0 pt-18 lg:pb-6 lg:pt-20">
        {/* Mobile hero — full bleed sides, starts below header */}
        <div className="animate-fade-up lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/foam-hero-mobile.webp"
            alt='FOAM tagline graphic reading "More time for what matters," captioned: FOAM picks up your laundry, washes and folds it, and delivers it back to your door — next to a laundry bag with the FOAM koala mascot peeking over folded towels.'
            width={1200}
            height={800}
            className="hero-mobile-banner-image"
          />
        </div>

        {/* Desktop/tablet hero */}
        <div className="site-shell hidden animate-fade-up lg:block">
          <div className="hero-desktop-banner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/foam-hero-desktop-v2.webp"
              alt='FOAM tagline graphic reading "More time for what matters," captioned: FOAM picks up your laundry, washes and folds it, and delivers it back to your door — next to a laundry bag with the FOAM koala mascot peeking over folded towels — with a "Schedule a Pickup" banner strip below it.'
              width={1800}
              height={801}
              className="hero-desktop-banner-image"
            />
            <div className="hero-desktop-banner-actions">
              <Button size="lg" asChild>
                <Link href={BOOKING_PATH}>
                  Book a Pickup <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile schedule — flush under hero; whole banner opens booking */}
        <Link
          href={BOOKING_PATH}
          className="schedule-banner reveal lg:hidden"
          aria-label="Schedule a pickup — open booking form"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/foam-schedule-banner.webp"
            alt='"Schedule a Pickup" graphic — a light blue and white capsule-shaped banner with soap bubble decorations.'
            width={1800}
            height={364}
            className="schedule-banner-image"
          />
          <div className="schedule-banner-actions flex">
            <Button size="sm" asChild>
              <span>
                Book a Pickup <ArrowRight />
              </span>
            </Button>
          </div>
        </Link>
      </section>

      <section id="how" className="scroll-mt-20 pb-8 pt-6 lg:pb-12 lg:pt-8">
        <div className="site-shell">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/foam-how-it-works.webp"
            alt='FOAM "How it works" — 1) Schedule: choose your pickup time. 2) We pick up: leave it at your door. 3) We wash & fold: cleaned your way. 4) Delivered: fresh & folded, back to you. Heading: From hamper to home, handled. A seamless laundry experience, from pickup to delivery.'
            width={1800}
            height={608}
            className="process-banner-image reveal hidden md:block"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/foam-how-it-works-mobile.webp"
            alt='FOAM "How it works" — 1) Schedule: choose your pickup time. 2) We pick up: leave it at your door. 3) We wash & fold: cleaned your way. 4) Delivered: fresh & folded, back to you. Heading: From hamper to home, handled. A seamless laundry experience, from pickup to delivery.'
            width={900}
            height={1549}
            className="process-banner-image reveal md:hidden"
          />
        </div>
      </section>

      <section className="pb-8 lg:pb-12" aria-label="Tagline">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/foam-tagline-banner-mobile.png"
          alt="FOAM — Pickup, Wash, Fold, Delivered. Less laundry. More life. We handle the laundry. You keep the time."
          width={1200}
          height={800}
          className="tagline-banner-image-mobile reveal"
        />
      </section>

      <section className="pb-10 lg:pb-14" aria-label="Service promises">
        <div className="site-shell">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/foam-trust-bar.webp"
            alt="FOAM service promises: Door-to-door service — pickup & delivery made easy. Pay by the pound — simple, transparent pricing. Your wash, your way — choose your preferences. Locally handled — care you can count on."
            width={1800}
            height={280}
            className="trust-banner-image reveal hidden md:block"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/foam-trust-bar-mobile.webp"
            alt="FOAM service promises: Door-to-door service — pickup & delivery made easy. Pay by the pound — simple, transparent pricing. Your wash, your way — choose your preferences. Locally handled — care you can count on."
            width={900}
            height={1546}
            className="trust-banner-image reveal md:hidden"
          />
        </div>
      </section>

      <section id="pricing" className="scroll-mt-20 pb-10 pt-2 lg:pb-14 lg:pt-4">
        <div className="site-shell">
          <div className="weight-helper reveal">
            <div className="pricing-graphics">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/pricing-graphic.jpg"
                alt="FOAM laundry service pricing: $2.35 per pound for Weekly Service, or $2.60 per pound otherwise, plus a $5.00 service fee per pickup. Minimum order total $50.00."
                className="pricing-graphic-img"
                width={1000}
                height={1000}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/weight-estimate-graphic.jpg"
                alt="The FOAM koala mascot sitting in a basket full of towels, captioned: Here is what 15 pounds of laundry looks like."
                className="pricing-graphic-img"
                width={1000}
                height={1000}
              />
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
