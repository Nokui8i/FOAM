import type { Metadata } from "next";

import { AdminApp } from "@/components/admin-app";
import "../ops-console.css";

export const metadata: Metadata = {
  title: "Ops | FOAM",
  description: "FOAM operations — orders and Contact Us.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPage() {
  return (
    <main className="admin-page">
      <AdminApp />
    </main>
  );
}
