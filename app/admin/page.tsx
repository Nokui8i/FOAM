import type { Metadata } from "next";

import { AdminContactsApp } from "@/components/admin-contacts-app";

export const metadata: Metadata = {
  title: "Admin | FOAM",
  description: "FOAM admin — Contact Us messages.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPage() {
  return (
    <main className="admin-page">
      <AdminContactsApp />
    </main>
  );
}
