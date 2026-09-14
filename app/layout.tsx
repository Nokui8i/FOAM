import type { Metadata } from "next";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "./globals.css";

import { MobileNavDrawer } from "@/components/mobile-nav";
import { AuthProvider } from "@/components/auth-provider";

const SCROLL_RESTORATION_SCRIPT = `(function(){try{if('scrollRestoration' in history){history.scrollRestoration='manual';}function r(){if(!location.hash){window.scrollTo(0,0);}}r();window.addEventListener('pageshow',r);}catch(e){}})();`;

// Dev-only mobile console: iPhone Safari has no remote inspector without a
// Mac. Eruda draws a small floating console bubble directly on the page —
// tap it on the phone to see console.log/errors/network without any cable.
// NODE_ENV is never "production" in a build, so this never ships live.
const isDev = process.env.NODE_ENV !== "production";

export const metadata: Metadata = {
  title: "FOAM | Premium Laundry Pickup & Delivery",
  description:
    "FOAM picks up, washes, folds, and delivers your laundry back—usually the next day.",
  openGraph: {
    title: "FOAM | Laundry, dissolved.",
    description: "Premium laundry pickup and delivery, handled door to door.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: SCROLL_RESTORATION_SCRIPT }}
        />
        {isDev ? (
          <>
            <script src="https://cdn.jsdelivr.net/npm/eruda" />
            <script
              dangerouslySetInnerHTML={{
                __html: "try{eruda.init();}catch(e){}",
              }}
            />
          </>
        ) : null}
      </head>
      <body className="antialiased">
        <AuthProvider>
          <MobileNavDrawer />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
