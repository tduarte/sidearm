import * as React from "react"

const MOBILE_BREAKPOINT = 768

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

/**
 * Reads the viewport width as an external store rather than mirroring it into
 * state from an effect, which avoids the extra render pass on mount (and the
 * `react-hooks/set-state-in-effect` lint error the effect version produced).
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    // Server snapshot: assume desktop so SSR and the first client paint agree.
    () => false,
  )
}
