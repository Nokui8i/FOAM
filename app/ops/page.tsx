import type { Metadata, Viewport } from "next";

import { AdminApp } from "@/components/admin-app";
import "../ops-console.css";

export const metadata: Metadata = {
  title: "Ops | FOAM",
  description: "FOAM operations console.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  // Staff emails are plain text — don’t let iOS Safari turn them into mailto links.
  other: {
    "format-detection": "email=no",
  },
};

/** Prevent iOS Safari focus-zoom on OPS inputs (sticky enlarged viewport). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function OpsPage() {
  return (
    <main className="admin-page">
      <AdminApp />
    </main>
  );
}
