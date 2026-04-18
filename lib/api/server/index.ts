import { mockAdapter } from "./mock";

/** Where the Route Handlers get their data. */
export type ServerApi = typeof mockAdapter;

const mode: "mock" | "real" =
  process.env.API_MODE === "real" ? "real" : "mock";

let realAdapter: ServerApi | null = null;
// Phase C will populate this with the CS2 RCON + Docker-backed adapter.

export const serverApi: ServerApi =
  mode === "real"
    ? realAdapter ??
      (() => {
        throw new Error(
          "API_MODE=real but real adapter isn't wired yet (see Phase C).",
        );
      })()
    : mockAdapter;

export const apiMode = mode;
