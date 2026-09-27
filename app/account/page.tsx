import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AccountApp } from "./account-app";
import "../account-ops.css";

export const metadata: Metadata = {
  title: "Account | FOAM",
  description: "Sign in to your FOAM account.",
};

export default function AccountPage() {
  return (
    <main className="account-ops-page flex min-h-svh flex-col text-foreground selection:bg-accent">
      <SiteHeader />
      <section className="account-section flex min-h-0 flex-1 flex-col">
        <div className="site-shell flex min-h-0 flex-1 flex-col px-4 sm:px-[var(--shell-pad,1.25rem)]">
          <AccountApp />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
