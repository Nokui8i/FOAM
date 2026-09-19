import type { Metadata } from "next";

import { AdminApp } from "@/components/admin-app";

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
};

export default function OpsPage() {
  return (
    <main className="admin-page">
      <AdminApp />
    </main>
  );
}
