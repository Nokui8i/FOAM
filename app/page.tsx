import Link from "next/link";

import { HomePriceOverlay } from "@/components/home-price-overlay";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BOOKING_PATH } from "@/lib/site-config";
import styles from "./desktop-panorama.module.css";

const STICKY_BOOK_BTN_DESKTOP_SRC = encodeURI(
  "/ChatGPT Image Sep 26, 2026, 12_18_21 PM.png"
);
const STICKY_BOOK_BTN_MOBILE_SRC = encodeURI(
  "/ChatGPT Image Sep 26, 2026, 12_23_30 PM.png"
);

const MOBILE_ARTWORK_HEIGHT = 13469;
const MOBILE_PANELS = [
  { start: 0, end: 2790, shortBlend: false },
  { start: 2790, end: 5217, shortBlend: false },
  { start: 5217, end: 6817, shortBlend: false },
  { start: 6817, end: 9320, shortBlend: false },
  // Full gen-mobile-05 pricing replacement (includes former header above 9561).
  { start: 9320, end: 11869, shortBlend: false },
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
                className={`${styles.mobilePanel} ${index > 0 && index !== 4 ? styles.mobileBlend : ""} ${shortBlend ? styles.mobileShortBlend : ""}`}
                style={{ aspectRatio: `1440 / ${height}` }}
                aria-hidden="true"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/home-mockup-mobile-v24.png"
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
                    src="/home-mockup-mobile-v24.png"
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
        <Link
          href={BOOKING_PATH}
          className="home-sticky-book-btn"
          aria-label="Book a Pickup"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="home-sticky-book-img home-sticky-book-img--mobile"
            src={STICKY_BOOK_BTN_MOBILE_SRC}
            alt=""
            width={2138}
            height={736}
            draggable={false}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="home-sticky-book-img home-sticky-book-img--desktop"
            src={STICKY_BOOK_BTN_DESKTOP_SRC}
            alt=""
            width={1967}
            height={800}
            draggable={false}
          />
        </Link>
      </div>

      <SiteFooter hideCta flushTop />
    </main>
  );
}
