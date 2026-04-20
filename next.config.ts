import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  env: {
    NEXT_PUBLIC_API_MODE: process.env.API_MODE === "real" ? "real" : "mock",
  },
};

export default nextConfig;
