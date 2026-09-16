"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";

export function HeaderAuthLink({ className }: { className?: string }) {
  const { user, ready } = useAuth();
  const label = !ready ? "Login" : user ? "Account" : "Login";

  return (
    <Button variant="outline" size="sm" asChild className={cn(className)}>
      <Link href="/account" className="relative z-60">
        {label}
      </Link>
    </Button>
  );
}
