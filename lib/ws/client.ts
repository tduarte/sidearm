"use client";

import { useEffect } from "react";
import type { WsEvent } from "@/lib/api/types";
import { bus } from "./bus";
import { startMockEmitter } from "./mock-emitter";

export function useServerEvents(
  filter: WsEvent["type"] | WsEvent["type"][] | "*",
  handler: (e: WsEvent) => void,
) {
  useEffect(() => {
    startMockEmitter();
    const types =
      filter === "*" ? null : Array.isArray(filter) ? filter : [filter];
    const unsub = bus.subscribe((e) => {
      if (types === null || types.includes(e.type)) handler(e);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
