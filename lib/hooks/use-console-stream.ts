"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { ConsoleEvent } from "@/lib/api/types";
import { useServerEvents } from "@/lib/ws/client";

const MAX = 2000;

export function useConsoleStream() {
  const [events, setEvents] = useState<ConsoleEvent[]>([]);

  useEffect(() => {
    api.getConsole().then((initial) => setEvents(initial));
  }, []);

  useServerEvents("console.line", (e) => {
    if (e.type !== "console.line") return;
    setEvents((prev) => {
      const next = [...prev, e.event];
      if (next.length > MAX) next.splice(0, next.length - MAX);
      return next;
    });
  });

  return events;
}
