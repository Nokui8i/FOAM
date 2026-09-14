"use client";

import Link from "next/link";

import { useAuth } from "@/components/auth-provider";

export function HeaderAuthLink() {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <Link
        className="nav-link relative z-60 inline-flex min-h-10 items-center px-1"
        href="/account"
      >
        Sign in
      </Link>
    );
  }

  return (
    <Link
      className="nav-link relative z-60 inline-flex min-h-10 items-center px-1"
      href="/account"
    >
      {user ? "Account" : "Sign in"}
    </Link>
  );
}
