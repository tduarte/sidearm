import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_MODE: process.env.API_MODE === "real" ? "real" : "mock",
  },
};

export default nextConfig;
