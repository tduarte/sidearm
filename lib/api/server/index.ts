import { mockAdapter } from "./mock";
import { realAdapter } from "./real";

/** Where the Route Handlers get their data. */
export type ServerApi = typeof mockAdapter;

const mode: "mock" | "real" =
  process.env.API_MODE === "real" ? "real" : "mock";

export const serverApi: ServerApi = mode === "real" ? realAdapter : mockAdapter;

export const apiMode = mode;
