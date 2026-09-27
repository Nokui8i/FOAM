import type { Metadata, Viewport } from "next";

import { DriverApp } from "@/components/driver-app";
import "../ops-console.css";

export const metadata: Metadata = {
  title: "Driver | FOAM",
  description: "FOAM driver console — pickups and deliveries.",
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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function DriverPage() {
  return (
    <main className="admin-page">
      <DriverApp />
    </main>
  );
}
