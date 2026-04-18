"use client";

import { useEffect, useRef, useState } from "react";
import { useServerEvents } from "@/lib/ws/client";

const MAX_POINTS = 40;

export function useStatHistory() {
  const [cpu, setCpu] = useState<number[]>([]);
  const [mem, setMem] = useState<number[]>([]);
  const [fps, setFps] = useState<number[]>([]);
  const seeded = useRef(false);

  useServerEvents("status.update", (e) => {
    if (e.type !== "status.update") return;
    if (!seeded.current) {
      setCpu(Array(MAX_POINTS).fill(e.status.cpuPct));
      setMem(Array(MAX_POINTS).fill(e.status.memMb));
      setFps(Array(MAX_POINTS).fill(e.status.fps));
      seeded.current = true;
      return;
    }
    setCpu((p) => [...p.slice(-MAX_POINTS + 1), e.status.cpuPct]);
    setMem((p) => [...p.slice(-MAX_POINTS + 1), e.status.memMb]);
    setFps((p) => [...p.slice(-MAX_POINTS + 1), e.status.fps]);
  });

  useEffect(() => {
    // keep reference lint happy
  }, []);

  return { cpu, mem, fps };
}
