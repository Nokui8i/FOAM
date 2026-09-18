import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BOOKING_PATH } from "@/lib/site-config";
import { WasherAnimation } from "@/components/washer-animation";

export default function Home() {
  return (
    <main className="home-page bg-background text-foreground selection:bg-accent">
      <SiteHeader />

      <section className="home-full" aria-label="FOAM homepage" id="top">
        <span id="how" className="home-anchor home-anchor--how" aria-hidden="true" />
        <span id="services" className="home-anchor home-anchor--services" aria-hidden="true" />
        <span id="pricing" className="home-anchor home-anchor--pricing" aria-hidden="true" />
        <div className="home-mobile-artwork">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/home-mockup-mobile-v18.png"
          alt="FOAM laundry: More time for what matters. Pickup, wash, fold and delivery in Las Vegas — how it works, services, pricing, and schedule a pickup."
          width={1440}
          height={13469}
          className="home-full-image home-full-image--mobile"
        />
        <WasherAnimation mobile />
        </div>
        <div className="home-full-desktop-shell">
          <div className="home-desktop-artwork">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/home-mockup-desktop-v21.png"
            alt="FOAM laundry: More time for what matters. Pickup, wash, fold and delivery in Las Vegas — how it works, services, pricing, and schedule a pickup."
            width={3840}
            height={12960}
            className="home-full-image home-full-image--desktop"
          />
          <WasherAnimation />
          </div>
        </div>
      </section>

      <div className="home-sticky-book">
        <Button size="lg" asChild className="home-sticky-book-btn">
          <Link href={BOOKING_PATH}>
            Book a Pickup <ArrowRight />
          </Link>
        </Button>
      </div>

      <SiteFooter hideCta flushTop />
    </main>
  );
}
