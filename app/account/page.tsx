import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AccountApp } from "./account-app";

export const metadata: Metadata = {
  title: "Account | FOAM",
  description: "Sign in to your FOAM account.",
};

export default function AccountPage() {
  return (
    <main className="overflow-hidden bg-background text-foreground selection:bg-accent">
      <SiteHeader />
      <section className="account-section">
        <div className="site-shell">
          <AccountApp />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
