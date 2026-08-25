import type { WsEvent } from "@/lib/api/types";

type Listener = (e: WsEvent) => void;

/**
 * Tiny event bus shared by the mock emitter, the real CS2 adapter, the API
 * route handlers, and the client-side WebSocket receiver.
 *
 * The instance is pinned to `globalThis` rather than being plain module state.
 * A module-level singleton is *not* enough here: `server.ts` is loaded by `tsx`
 * while the `app/api/**` route handlers are bundled separately by Next, so the
 * two get distinct module registries and therefore distinct instances (four of
 * them, measured). Only the `tsx`-side instance is wired to the WebSocket
 * broadcaster in `lib/ws/server.ts`, so any `emit` from a route handler would
 * be silently dropped.
 *
 * Same reasoning — and same fix — as `global.__cs2Cache` in
 * `lib/api/server/real.ts`.
 *
 * Still safe to import from the browser: `globalThis` is per-realm, so a tab
 * gets its own bus and the Node server gets its own.
 */
class EventBus {
  private listeners = new Set<Listener>();

  emit(e: WsEvent) {
    for (const l of this.listeners) l(e);
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
}

declare global {
  var __sidearmBus: EventBus | undefined;
}

export const bus: EventBus = (globalThis.__sidearmBus ??= new EventBus());
