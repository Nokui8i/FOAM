import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HomePricingSection } from "@/components/home-pricing-section";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BOOKING_PATH } from "@/lib/site-config";
import styles from "./desktop-panorama.module.css";

const MOBILE_ARTWORK_HEIGHT = 13469;
/** Image panels before / after the real HTML pricing section. */
const MOBILE_BEFORE = [
  { start: 0, end: 2790, shortBlend: false },
  { start: 2790, end: 5217, shortBlend: false },
  { start: 5217, end: 6817, shortBlend: false },
  { start: 6817, end: 9561, shortBlend: false },
] as const;
const MOBILE_AFTER = [
  { start: 11869, end: MOBILE_ARTWORK_HEIGHT, shortBlend: true },
] as const;

const DESKTOP_SRC = "/home-mockup-desktop-v22.jpg";
const MOBILE_SRC = "/home-mockup-mobile-v19.jpg";

function MobilePanels({
  panels,
}: {
  panels: readonly { start: number; end: number; shortBlend: boolean }[];
}) {
  return (
    <>
      {panels.map(({ start, end, shortBlend }) => {
        const height = end - start;
        const isFirst = start === 0;

        return (
          <div
            key={start}
            className={`${styles.mobilePanel} ${!isFirst ? styles.mobileBlend : ""} ${shortBlend ? styles.mobileShortBlend : ""}`}
            style={{ aspectRatio: `1440 / ${height}` }}
            aria-hidden="true"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={MOBILE_SRC}
              alt=""
              width={1440}
              height={MOBILE_ARTWORK_HEIGHT}
              style={{
                height: `${(MOBILE_ARTWORK_HEIGHT / height) * 100}%`,
                top: `${-(start / height) * 100}%`,
              }}
            />
            {!isFirst && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={MOBILE_SRC}
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
          </div>
        );
      })}
    </>
  );
}

export default function Home() {
  return (
    <main className="home-page bg-background text-foreground selection:bg-accent">
      <SiteHeader />

      <section className="home-full" aria-label="FOAM homepage" id="top">
        <span id="how" className="home-anchor home-anchor--how" aria-hidden="true" />
        <span id="services" className="home-anchor home-anchor--services" aria-hidden="true" />

        <div
          className={`home-full-image--mobile ${styles.mobilePanorama}`}
          role="img"
          aria-label="FOAM laundry: More time for what matters. Pickup, wash, fold and delivery in Las Vegas — how it works, services, and schedule a pickup."
        >
          <MobilePanels panels={MOBILE_BEFORE} />
        </div>

        <div className="home-full-desktop-shell">
          <div
            className={`home-full-image--desktop ${styles.panorama}`}
            role="img"
            aria-label="FOAM laundry: More time for what matters. Pickup, wash, fold and delivery in Las Vegas — how it works and services."
          >
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className={`${styles.panel} ${index > 0 ? styles.blend : ""}`}
                aria-hidden="true"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={DESKTOP_SRC}
                  alt=""
                  width={3840}
                  height={12960}
                  style={{ top: `${index * -100}%` }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="home-full-desktop-shell home-pricing-shell">
          <HomePricingSection />
        </div>

        <div
          className={`home-full-image--mobile ${styles.mobilePanorama}`}
          role="img"
          aria-label="FOAM laundry call to action"
        >
          <MobilePanels panels={MOBILE_AFTER} />
        </div>

        <div className="home-full-desktop-shell">
          <div
            className={`home-full-image--desktop ${styles.panorama}`}
            role="img"
            aria-label="FOAM laundry call to action"
          >
            <div
              className={`${styles.panel} ${styles.shortBlend}`}
              aria-hidden="true"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={DESKTOP_SRC}
                alt=""
                width={3840}
                height={12960}
                style={{ top: "-500%" }}
              />
            </div>
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
