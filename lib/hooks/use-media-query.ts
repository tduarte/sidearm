"use client";

import { useEffect, useState } from "react";

/**
 * Tracks `window.matchMedia`. Initial value is always `false` so SSR + first
 * client paint match; updates after mount (avoids hydration mismatches).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);

  return matches;
}
