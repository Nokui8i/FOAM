import Link from "next/link";
import { MapPin } from "lucide-react";

import { MobileNavTrigger } from "@/components/mobile-nav";
import { HeaderAuthLink } from "@/components/header-auth-link";

const DESKTOP_LINKS = [
  { href: "/#services", label: "Services" },
  { href: "/#how", label: "How It Works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/dry-cleaning", label: "Dry Cleaning" },
  { href: "/specialty", label: "Specialty" },
  { href: "/guide", label: "Guide" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  return (
    <header className="site-header">
      <nav className="site-shell site-header-inner" aria-label="Main navigation">
        <Link href="/#top" className="site-header-logo" aria-label="FOAM home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="site-header-logo-img"
            src="/foam-ops-logo.png"
            alt="FOAM"
            width={217}
            height={72}
          />
        </Link>

        <div className="site-header-nav">
          {DESKTOP_LINKS.map((link) => (
            <Link key={link.href} className="nav-link" href={link.href}>
              {link.label}
            </Link>
          ))}
        </div>

        <div className="site-header-right">
          <span className="site-header-location" aria-label="Serving Las Vegas, Nevada">
            <MapPin size={18} aria-hidden="true" />
            Las Vegas, NV
          </span>

          <HeaderAuthLink className="site-header-login" />

          <MobileNavTrigger />
        </div>
      </nav>
    </header>
  );
}
