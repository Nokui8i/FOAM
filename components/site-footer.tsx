import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BOOKING_PATH } from "@/lib/site-config";

const FOOTER_LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/dry-cleaning", label: "Dry Cleaning" },
  { href: "/specialty", label: "Specialty" },
  { href: "/guide", label: "First Order Guide" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/account", label: "Account" },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-shell site-footer-inner">
        <div className="site-footer-top">
          <div className="site-footer-brand">
            <Link className="site-footer-wordmark" href="/#top">
              FOAM<span className="site-footer-wordmark-dot">.</span>
            </Link>
            <p className="site-footer-tagline">Less laundry. More life.</p>
          </div>

          <Button size="lg" asChild className="site-footer-cta">
            <Link href={BOOKING_PATH}>
              Book a Pickup
              <ArrowRight />
            </Link>
          </Button>
        </div>

        <nav className="site-footer-nav" aria-label="Footer">
          {FOOTER_LINKS.map((link) => (
            <Link key={link.href} className="site-footer-link" href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="site-footer-meta">
          <p className="site-footer-trust">
            Locally operated · Card payments only
          </p>
          <div className="site-footer-bottom">
            <p>© 2026 FOAM Laundry</p>
            <p>Pickup · Wash · Fold · Delivered</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
