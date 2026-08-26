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
  // No `env` block. NEXT_PUBLIC_API_MODE used to be inlined here, which
  // evaluates at BUILD time — and the Dockerfile builds without API_MODE set,
  // so every containerized deploy shipped a bundle claiming "mock mode" while
  // the server ran in real mode. The mode now reaches the client from the
  // server layout at request time (components/panel-info.tsx).
};

export default nextConfig;
