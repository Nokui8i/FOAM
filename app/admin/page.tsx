import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not found | FOAM",
  robots: {
    index: false,
    follow: false,
  },
};

/** Decoy — guessing /admin should not reveal the ops console. */
export default function AdminDecoyPage() {
  return (
    <main className="admin-page">
      <div className="admin-login">
        <h1 className="admin-title">Page not found</h1>
        <p className="admin-muted">
          This page doesn&apos;t exist. Head back to the homepage.
        </p>
        <Link href="/" className="admin-muted" style={{ fontWeight: 700 }}>
          Go home
        </Link>
      </div>
    </main>
  );
}
