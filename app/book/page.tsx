import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { BookingApp } from "@/components/booking-app";

export const metadata: Metadata = {
  title: "Schedule a Pickup | FOAM",
  description:
    "Book FOAM laundry or dry cleaning pickup — no account required.",
};

export default function BookPage() {
  return (
    <main className="book-page flex min-h-svh flex-col bg-background text-foreground selection:bg-accent">
      <SiteHeader />
      <section className="book-section flex flex-1 flex-col">
        <div className="site-shell flex w-full max-w-lg flex-1 flex-col px-4 pb-4 sm:px-6">
          <BookingApp />
        </div>
      </section>
    </main>
  );
}
