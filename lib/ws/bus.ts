import type { WsEvent } from "@/lib/api/types";

type Listener = (e: WsEvent) => void;

/**
 * Tiny event bus shared by the mock emitter (server-side) and the client-side
 * WebSocket receiver. Safe to import from both environments — module state is
 * per-process, so the browser gets its own instance and the Node server gets
 * its own.
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

export const bus = new EventBus();
