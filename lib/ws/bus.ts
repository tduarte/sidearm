"use client";

import type { WsEvent } from "@/lib/api/types";

type Listener = (e: WsEvent) => void;

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
