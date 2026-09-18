import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BOOKING_PATH } from "@/lib/site-config";
import styles from "./desktop-panorama.module.css";

export default function Home() {
  return (
    <main className="home-page bg-background text-foreground selection:bg-accent">
      <SiteHeader />

      <section className="home-full" aria-label="FOAM homepage" id="top">
        <span id="how" className="home-anchor home-anchor--how" aria-hidden="true" />
        <span id="services" className="home-anchor home-anchor--services" aria-hidden="true" />
        <span id="pricing" className="home-anchor home-anchor--pricing" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/home-mockup-mobile-v18.png"
          alt="FOAM laundry: More time for what matters. Pickup, wash, fold and delivery in Las Vegas — how it works, services, pricing, and schedule a pickup."
          width={1440}
          height={13469}
          className="home-full-image home-full-image--mobile"
        />
        <div className="home-full-desktop-shell">
          <div
            className={`home-full-image--desktop ${styles.panorama}`}
            role="img"
            aria-label="FOAM laundry: More time for what matters. Pickup, wash, fold and delivery in Las Vegas — how it works, services, pricing, and schedule a pickup."
          >
            {/* Six equal 3840 × 2160 panels from the original desktop artwork.
                Each layer reuses the same URL, so the browser caches one asset. */}
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className={`${styles.panel} ${index > 0 ? styles.blend : ""} ${index >= 4 ? styles.shortBlend : ""}`}
                aria-hidden="true"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/home-mockup-desktop-v21.png"
                  alt=""
                  width={3840}
                  height={12960}
                  style={{ top: `${index * -100}%` }}
                />
              </div>
            ))}
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
