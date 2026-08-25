"use client";

import { useEffect, useRef } from "react";
import type { WsEvent } from "@/lib/api/types";
import { bus } from "./bus";

/** Singleton WebSocket bound to `/ws`, reconnecting with exponential backoff. */
let ws: WebSocket | null = null;
let reconnectMs = 500;
const MAX_BACKOFF_MS = 15_000;

function connect() {
  if (typeof window === "undefined") return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${window.location.host}/ws`;
  ws = new WebSocket(url);

  ws.addEventListener("open", () => {
    reconnectMs = 500;
  });

  ws.addEventListener("message", (ev) => {
    try {
      const parsed = JSON.parse(String(ev.data)) as WsEvent;
      bus.emit(parsed);
    } catch {
      // Drop malformed frames — server should only ever send JSON WsEvents.
    }
  });

  const reopen = () => {
    ws = null;
    const delay = reconnectMs;
    reconnectMs = Math.min(reconnectMs * 2, MAX_BACKOFF_MS);
    setTimeout(connect, delay);
  };

  ws.addEventListener("close", reopen);
  ws.addEventListener("error", () => ws?.close());
}

/**
 * Subscribe to typed WebSocket events from the panel server. The first caller
 * in the tab's lifetime opens the WS; subsequent callers reuse it.
 */
export function useServerEvents(
  filter: WsEvent["type"] | WsEvent["type"][] | "*",
  handler: (e: WsEvent) => void,
) {
  // The subscription is intentionally created once, but it must not capture the
  // first render's `handler`/`filter`. Routing through refs keeps a single
  // subscription while always dispatching to the current callback — otherwise a
  // handler closing over changing props silently goes stale.
  const handlerRef = useRef(handler);
  const filterRef = useRef(filter);

  // Updated in an effect rather than during render — refs must not be written
  // while rendering.
  useEffect(() => {
    handlerRef.current = handler;
    filterRef.current = filter;
  });

  useEffect(() => {
    connect();
    return bus.subscribe((e) => {
      const f = filterRef.current;
      const types = f === "*" ? null : Array.isArray(f) ? f : [f];
      if (types === null || types.includes(e.type)) handlerRef.current(e);
    });
  }, []);
}
