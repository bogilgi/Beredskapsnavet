import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Appen är avsedd för drift i egen miljö (on-prem eller svensk molnleverantör).
  // Inga externa tjänster anropas i runtime.
  outputFileTracingIncludes: { "/**": ["./db/**"] },
};

export default nextConfig;
