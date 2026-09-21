import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { TrackApp } from "@/components/track-app";

export const metadata: Metadata = {
  title: "Track your order | FOAM",
  description: "Follow your FOAM laundry pickup and delivery progress.",
};

export default function TrackPage() {
  return (
    <main className="track-page flex min-h-svh flex-col bg-background text-foreground selection:bg-accent">
      <SiteHeader />
      <section className="book-section flex flex-1 flex-col">
        <div className="site-shell flex w-full max-w-2xl flex-1 flex-col px-4 pb-8 sm:px-6">
          <TrackApp />
        </div>
      </section>
    </main>
  );
}
