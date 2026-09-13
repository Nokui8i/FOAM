import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MobileNavTrigger } from "@/components/mobile-nav";
import { HeaderAuthLink } from "@/components/header-auth-link";
import { BOOKING_PATH } from "@/lib/site-config";

export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-[100] border-b border-border/70 bg-background/95">
      <nav
        className="site-shell flex h-18 items-center justify-between gap-2"
        aria-label="Main navigation"
      >
        <Link href="/#top" className="wordmark shrink-0" aria-label="FOAM home">
          FOAM<span className="text-accent-strong">.</span>
        </Link>

        <div className="header-mobile-links md:hidden">
          <Link className="nav-link" href="/dry-cleaning">
            Dry Cleaning
          </Link>
          <Link className="nav-link" href="/guide">
            First Order
          </Link>
        </div>

        <div className="hidden items-center gap-8 md:flex">
          <Link className="nav-link" href="/#how">
            How it works
          </Link>
          <Link className="nav-link" href="/dry-cleaning">
            Dry Cleaning
          </Link>
          <Link className="nav-link" href="/specialty">
            Specialty
          </Link>
          <Link className="nav-link" href="/guide">
            First Order Guide
          </Link>
          <Link className="nav-link" href="/faq">
            FAQ
          </Link>
          <Link className="nav-link" href="/about">
            About
          </Link>
          <Link className="nav-link" href="/contact">
            Contact
          </Link>
          <HeaderAuthLink />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="md:hidden">
            <HeaderAuthLink />
          </div>
          <Button variant="ink" asChild className="hidden sm:inline-flex">
            <Link href={BOOKING_PATH}>
              Book a Pickup <ArrowRight />
            </Link>
          </Button>
          <MobileNavTrigger />
        </div>
      </nav>
    </header>
  );
}
