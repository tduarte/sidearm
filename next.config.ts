import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Server-only Node packages that must be `require`d natively rather than
   * bundled.
   *
   * `dockerode` pulls in `docker-modem` → `ssh2`, which ships an optional
   * native binding (`cpu-features`). Wherever a C++ toolchain is present —
   * notably the Alpine build image, which needs one for `better-sqlite3` —
   * that binding compiles to a `.node` file and the Turbopack production build
   * fails with "non-ecmascript placeable asset". It builds fine on a machine
   * without a compiler, so this only reproduces in Docker.
   */
  serverExternalPackages: ["better-sqlite3", "dockerode"],
  env: {
    NEXT_PUBLIC_API_MODE: process.env.API_MODE === "real" ? "real" : "mock",
  },
};

export default nextConfig;
