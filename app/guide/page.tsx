import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Bell,
  CircleHelp,
  ClipboardList,
  Droplets,
  MapPin,
  Package,
  Scale,
  Sparkles,
  Truck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BOOKING_PATH } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "First Order Guide | FOAM",
  description:
    "Your first FOAM pickup — what to expect and what to do, from scheduling to delivery.",
};

const GUIDE_ITEMS: {
  title: string;
  copy: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Schedule a Pickup",
    copy: "Open our booking form, enter your address and what you need washed, and choose a pickup window. Once you submit, your pickup is confirmed — no account setup required.",
    icon: ClipboardList,
  },
  {
    title: "Your FOAM Laundry Bag",
    copy: "For your first pickup, place your laundry in any bag clearly marked with your name and \"For FOAM\". We recommend a plastic or cloth bag — please don't use hampers or boxes, as they can get damaged in transit. You'll receive your FOAM laundry bag(s) on drop-off, which you can use for all future pickups.",
    icon: Package,
  },
  {
    title: "Your First Pickup",
    copy: "On pickup day, we'll send you a time window for when to expect our driver. Leave your bag outside your door — no sorting required. You'll get another message when your laundry has been collected.",
    icon: Truck,
  },
  {
    title: "Additional Pickup & Delivery Instructions",
    copy: "Need a gate code, key instructions, or a specific place to leave the bag? Include those details in the booking form so your driver can find everything easily.",
    icon: MapPin,
  },
  {
    title: "Laundry Preferences",
    copy: "We'll do your laundry the way you want it. Tell us your detergent, softener, dryer, bleach, and folding preferences — plus any extra notes — in the booking form.",
    icon: Sparkles,
  },
  {
    title: "Stubborn Stains",
    copy: "If you have stained clothing, place it in a separate \"Special Attention\" bag and note it in your booking form so we give it extra care. Pretreating the stain yourself gives us the best chance of getting it out.",
    icon: Droplets,
  },
  {
    title: "Estimating Your Cost",
    copy: "Weight can be tricky to guess. A 13-gallon kitchen bag holds about 15 pounds of laundry — and first-time customers often underestimate. Check the pricing section on our homepage for rates and a visual of what 15 pounds looks like. Regular customers typically spend around $30–$40 per week.",
    icon: Scale,
  },
  {
    title: "We'll Stay In Touch",
    copy: "Communication matters. We'll send reminders and updates so you always know when pickup is coming and when your laundry is on the way back.",
    icon: Bell,
  },
  {
    title: "Any Other Questions? We've Got Answers.",
    copy: "Browse our FAQ, or reach out through Contact — we're happy to help with anything else before your first order.",
    icon: CircleHelp,
  },
];

export default function GuidePage() {
  return (
    <main className="overflow-hidden bg-background text-foreground selection:bg-accent">
      <SiteHeader />

      <section className="guide-hero" aria-label="First Order Guide">
        <div className="guide-hero-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/foam-guide-hero.png"
            alt='First Order Guide — Your first pickup. Easy. Everything you need to know before we collect your laundry. FOAM laundry bag, folded towels, and detergent on a bright surface.'
            width={1800}
            height={900}
            className="guide-hero-image"
          />
        </div>
      </section>

      <section className="guide-grid-section">
        <div className="site-shell">
          <div className="guide-grid">
            {GUIDE_ITEMS.map((item, index) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="guide-card">
                  <div className="guide-card-top">
                    <span className="guide-card-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="guide-card-icon" aria-hidden="true">
                      <Icon />
                    </span>
                  </div>
                  <h3 className="guide-card-title">{item.title}</h3>
                  <p className="guide-card-copy">{item.copy}</p>
                </article>
              );
            })}
          </div>

          <div className="guide-cta reveal">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/foam-schedule-banner.webp"
              alt="Schedule a Pickup — FOAM banner with soap bubbles."
              width={1800}
              height={364}
              className="guide-cta-image guide-cta-image-mobile"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/foam-guide-cta.png"
              alt="Schedule a Pickup — FOAM banner with soap bubbles."
              width={1800}
              height={400}
              className="guide-cta-image guide-cta-image-desktop"
            />
            <div className="guide-cta-actions">
              <Button size="sm" asChild>
                <Link href={BOOKING_PATH}>
                  Book a Pickup <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
