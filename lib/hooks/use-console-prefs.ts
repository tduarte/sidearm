"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "sidearm.console.autoscroll";

/**
 * localStorage is an external store, so it is read through
 * `useSyncExternalStore` rather than copied into state inside an effect.
 * Seeding state from storage in an effect triggers a cascading render and is
 * rejected by the React Compiler lint; this also gives a correct SSR snapshot
 * for free.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Keeps two open tabs in agreement.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Must return a stable primitive, or React re-renders forever. */
function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "false";
  } catch {
    // Private mode or storage disabled.
    return true;
  }
}

/** No storage on the server; follow-the-tail is the sensible default. */
function getServerSnapshot(): boolean {
  return true;
}

/**
 * The console's follow-the-tail default, remembered in this browser.
 *
 * The Settings page used to offer this as a switch with no handler, and the
 * console hardcoded `useState(true)` and read no setting at all. It is a purely
 * local preference — there is no per-user server state to put it in.
 */
export function useConsolePrefs() {
  const autoscroll = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setAutoscroll = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(KEY, String(next));
    } catch {
      /* non-critical */
    }
    for (const listener of listeners) listener();
  }, []);

  return { autoscroll, setAutoscroll };
}
