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
    <main className="flex min-h-svh flex-col bg-white text-foreground selection:bg-accent">
      <SiteHeader />
      <section className="account-section flex-1 pb-8 sm:pb-10">
        <div className="site-shell px-4 sm:px-[var(--shell-pad,1.25rem)]">
          <AccountApp />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
