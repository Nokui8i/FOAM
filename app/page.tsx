import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HomePriceOverlay } from "@/components/home-price-overlay";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BOOKING_PATH } from "@/lib/site-config";
import styles from "./desktop-panorama.module.css";

const MOBILE_ARTWORK_HEIGHT = 13469;
const MOBILE_PANELS = [
  { start: 0, end: 2790, shortBlend: false },
  { start: 2790, end: 5217, shortBlend: false },
  { start: 5217, end: 6817, shortBlend: false },
  { start: 6817, end: 9561, shortBlend: false },
  { start: 9561, end: 11869, shortBlend: true },
  { start: 11869, end: MOBILE_ARTWORK_HEIGHT, shortBlend: true },
] as const;

export default function Home() {
  return (
    <main className="home-page bg-background text-foreground selection:bg-accent">
      <SiteHeader />

      <section className="home-full" aria-label="FOAM homepage" id="top">
        <span id="how" className="home-anchor home-anchor--how" aria-hidden="true" />
        <span id="services" className="home-anchor home-anchor--services" aria-hidden="true" />
        <span id="pricing" className="home-anchor home-anchor--pricing" aria-hidden="true" />
        <div
          className={`home-full-image--mobile ${styles.mobilePanorama}`}
          role="img"
          aria-label="FOAM laundry: More time for what matters. Pickup, wash, fold and delivery in Las Vegas — how it works, services, pricing, and schedule a pickup."
        >
          {MOBILE_PANELS.map(({ start, end, shortBlend }, index) => {
            const height = end - start;

            return (
              <div
                key={start}
                className={`${styles.mobilePanel} ${index > 0 ? styles.mobileBlend : ""} ${shortBlend ? styles.mobileShortBlend : ""}`}
                style={{ aspectRatio: `1440 / ${height}` }}
                aria-hidden="true"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/home-mockup-mobile-v22.png"
                  alt=""
                  width={1440}
                  height={MOBILE_ARTWORK_HEIGHT}
                  style={{
                    height: `${(MOBILE_ARTWORK_HEIGHT / height) * 100}%`,
                    top: `${-(start / height) * 100}%`,
                  }}
                />
                {index > 0 && index !== 4 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src="/home-mockup-mobile-v22.png"
                    alt=""
                    width={1440}
                    height={MOBILE_ARTWORK_HEIGHT}
                    className={styles.mobileTextRestore}
                    style={{
                      height: `${(MOBILE_ARTWORK_HEIGHT / height) * 100}%`,
                      top: `${-(start / height) * 100}%`,
                    }}
                  />
                )}
                {index === 4 ? <HomePriceOverlay variant="mobile" /> : null}
              </div>
            );
          })}
        </div>
        <div className="home-full-desktop-shell">
          <div
            className={`home-full-image--desktop ${styles.panorama}`}
            role="img"
            aria-label="FOAM laundry: More time for what matters. Pickup, wash, fold and delivery in Las Vegas — how it works, services, pricing, and schedule a pickup."
          >
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className={`${styles.panel} ${index > 0 ? styles.blend : ""} ${index >= 4 ? styles.shortBlend : ""}`}
                aria-hidden="true"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/home-mockup-desktop-v24.png"
                  alt=""
                  width={3840}
                  height={12960}
                  style={{ top: `${index * -100}%` }}
                />
                {index === 4 ? <HomePriceOverlay /> : null}
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
