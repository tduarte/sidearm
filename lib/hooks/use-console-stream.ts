"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { ConsoleEvent } from "@/lib/api/types";
import { useServerEvents } from "@/lib/ws/client";

const MAX = 2000;

export type ConsoleStreamState = "loading" | "ready" | "error";

export interface ConsoleStream {
  events: ConsoleEvent[];
  /**
   * Distinguishes a silent server from a backlog that failed to load. Both
   * used to render as "No events yet…", and the failure was an unhandled
   * promise rejection on top.
   */
  state: ConsoleStreamState;
  error: string | null;
}

export function useConsoleStream(): ConsoleStream {
  const [events, setEvents] = useState<ConsoleEvent[]>([]);
  const [state, setState] = useState<ConsoleStreamState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getConsole()
      .then((initial) => {
        if (cancelled) return;
        setEvents(initial);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useServerEvents("console.line", (e) => {
    if (e.type !== "console.line") return;
    // A live line proves the stream works even if the initial backlog fetch
    // failed, so stop showing the error once one arrives.
    setState((prev) => (prev === "ready" ? prev : "ready"));
    setEvents((prev) => {
      const next = [...prev, e.event];
      if (next.length > MAX) next.splice(0, next.length - MAX);
      return next;
    });
  });

  return { events, state, error };
}
