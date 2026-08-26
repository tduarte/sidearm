"use client";

import { createContext, useContext } from "react";

export interface PanelInfo {
  /** Which adapter the server is really running, read at request time. */
  apiMode: "real" | "mock";
  version: string;
}

const PanelInfoContext = createContext<PanelInfo>({
  apiMode: "mock",
  version: "0.0.0",
});

/**
 * Panel facts that only the server knows, handed to client components.
 *
 * `API_MODE` cannot be read in the browser and must not be baked into the
 * image. `next.config.ts` used to inline it as `NEXT_PUBLIC_API_MODE` at build
 * time, but the Dockerfile runs `npm run build` without it, so every
 * containerized deploy shipped a bundle that said "mock mode" while the server
 * was in real mode. Passing it from the server layout means it is read per
 * request, and one image works in either mode.
 */
export function PanelInfoProvider({
  value,
  children,
}: {
  value: PanelInfo;
  children: React.ReactNode;
}) {
  return (
    <PanelInfoContext.Provider value={value}>
      {children}
    </PanelInfoContext.Provider>
  );
}

export function usePanelInfo(): PanelInfo {
  return useContext(PanelInfoContext);
}
