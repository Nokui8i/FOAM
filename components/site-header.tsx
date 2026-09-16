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
        className="site-shell grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-2 md:flex md:h-18 md:justify-between"
        aria-label="Main navigation"
      >
        <Link
          href="/#top"
          className="wordmark justify-self-start shrink-0"
          aria-label="FOAM home"
        >
          FOAM<span className="text-accent-strong">.</span>
        </Link>

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
        </div>

        {/* Mobile: centered equal buttons */}
        <div className="header-actions-mobile md:hidden">
          <HeaderAuthLink className="header-action-btn" />
          <Button variant="ink" size="sm" asChild className="header-action-btn">
            <Link href={BOOKING_PATH}>Book</Link>
          </Button>
        </div>

        <div className="flex items-center justify-self-end gap-2 md:shrink-0">
          <div className="hidden items-center gap-2 md:flex">
            <HeaderAuthLink className="header-action-btn" />
            <Button variant="ink" size="sm" asChild className="header-action-btn">
              <Link href={BOOKING_PATH}>
                Book a Pickup <ArrowRight />
              </Link>
            </Button>
          </div>
          <MobileNavTrigger />
        </div>
      </nav>
    </header>
  );
}
