import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { BookingApp } from "@/components/booking-app";
import "../book-ops.css";

export const metadata: Metadata = {
  title: "Schedule a Pickup | FOAM",
  description:
    "Book FOAM laundry or dry cleaning pickup — no account required.",
};

export default function BookPage() {
  return (
    <main className="book-ops-page book-page flex min-h-svh flex-col text-foreground selection:bg-accent">
      <SiteHeader />
      <section className="book-section flex min-h-0 flex-1 flex-col">
        <div className="book-shell">
          <BookingApp />
        </div>
      </section>
    </main>
  );
}
