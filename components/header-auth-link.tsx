"use client";

import Link from "next/link";

import { useAuth } from "@/components/auth-provider";

export function HeaderAuthLink() {
  const { user, ready } = useAuth();

  if (!ready) {
    return <span className="nav-link opacity-50">Account</span>;
  }

  return (
    <Link className="nav-link" href="/account">
      {user ? "Account" : "Sign in"}
    </Link>
  );
}
