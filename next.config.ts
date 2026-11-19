import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  // Next.js 16 `matchWildcardDomain` requires recursive `**` to match multi-level
  // Cloud Run preview subdomains such as `ais-dev-<id>.<region>.run.app`.
  allowedDevOrigins: ["**.run.app", "*.run.app", "localhost", "127.0.0.1"],
};

export default nextConfig;
