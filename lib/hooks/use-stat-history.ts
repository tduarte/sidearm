"use client";

import { useRef, useState } from "react";
import { useServerEvents } from "@/lib/ws/client";

const MAX_POINTS = 40;

/**
 * Rolling history for the dashboard sparklines.
 *
 * There is deliberately no FPS series. CS2 removed the `stats` table that
 * reported server framerate — it answers with an empty string — so
 * `ServerStatus.fps` is always null. Charting it drew a flat line of zeros that
 * read as telemetry.
 */
export function useStatHistory() {
  const [cpu, setCpu] = useState<number[]>([]);
  const [mem, setMem] = useState<number[]>([]);
  const seeded = useRef(false);

  useServerEvents("status.update", (e) => {
    if (e.type !== "status.update") return;
    if (!seeded.current) {
      setCpu(Array(MAX_POINTS).fill(e.status.cpuPct));
      setMem(Array(MAX_POINTS).fill(e.status.memMb));
      seeded.current = true;
      return;
    }
    setCpu((p) => [...p.slice(-MAX_POINTS + 1), e.status.cpuPct]);
    setMem((p) => [...p.slice(-MAX_POINTS + 1), e.status.memMb]);
  });

  return { cpu, mem };
}
