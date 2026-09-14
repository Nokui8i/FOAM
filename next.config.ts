import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Firebase Hosting (Spark/free plan) — no server
  // runtime needed, since the sign-in flow is entirely client-side
  // Firebase Auth. See app/api/auth/google-client-id/route.ts for the one
  // route this affects (already unused and stubbed static-safe).
  output: "export",
};

export default nextConfig;
