import type { Metadata } from "next";
import Link from "next/link";

import { ContactForm } from "@/components/contact-form";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BOOKING_PATH, CONTACT_EMAIL } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Contact | FOAM",
  description:
    "Get in touch with FOAM for questions, scheduling help, or anything else about laundry pickup and delivery.",
};

export default function ContactPage() {
  return (
    <main className="overflow-hidden bg-background text-foreground selection:bg-accent">
      <SiteHeader />

      <section className="dc-hero" aria-label="Contact">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/foam-contact-hero.png"
          alt="Contact FOAM. Get in touch with questions or special requests."
          width={1800}
          height={900}
          className="dc-hero-image"
        />
      </section>

      <section className="contact-section" aria-label="Contact form">
        <div className="site-shell">
          <div className="contact-layout">
            <aside className="contact-aside">
              <h2 className="contact-aside-title">Prefer to book instead?</h2>
              <p>
                Ready for pickup? Head straight to scheduling. No back and forth
                needed.
              </p>
              <Link className="contact-aside-link" href={BOOKING_PATH}>
                Book a Pickup
              </Link>

              <div className="contact-aside-email">
                <p className="contact-aside-label">Email</p>
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </div>
            </aside>

            <div className="contact-panel">
              <ContactForm />
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
