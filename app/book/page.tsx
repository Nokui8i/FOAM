import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Schedule a Pickup | FOAM",
  description:
    "Book your FOAM laundry pickup — the full booking form is coming soon.",
};

export default function BookPage() {
  return (
    <main className="overflow-hidden bg-background text-foreground selection:bg-accent">
      <SiteHeader />

      <section className="page-hero">
        <div className="site-shell">
          <div className="section-intro max-w-2xl">
            <p className="eyebrow">Schedule a Pickup</p>
            <h1 className="page-title">
              Booking form
              <br />
              coming soon.
            </h1>
            <p className="section-copy">
              This is where the FOAM pickup form will live. For now, explore how
              the service works — we&rsquo;ll plug the form in here next.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href="/guide">
                  First Order Guide <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/#how">See how it works</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
