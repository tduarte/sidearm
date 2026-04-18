"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { PaperPlaneRight, Broom, PushPin, PushPinSlash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { useConsoleStream } from "@/lib/hooks/use-console-stream";
import type { ConsoleLevel } from "@/lib/api/types";

const LEVEL_COLOR: Record<ConsoleLevel, string> = {
  info: "text-muted-foreground",
  warn: "text-amber-400",
  error: "text-red-400",
  chat: "text-emerald-300",
};

export function ConsolePane({ chatOnly = false }: { chatOnly?: boolean }) {
  const events = useConsoleStream();
  const [levels, setLevels] = useState<ConsoleLevel[]>(
    chatOnly ? ["chat"] : ["info", "warn", "error", "chat"],
  );
  const [autoscroll, setAutoscroll] = useState(true);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(
    () => events.filter((e) => levels.includes(e.level)),
    [events, levels],
  );

  useEffect(() => {
    if (!autoscroll) return;
    const el = viewportRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered, autoscroll]);

  const rcon = useMutation({
    mutationFn: (cmd: string) => api.rcon(cmd),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd) return;
    rcon.mutate(cmd);
    setHistory((h) => [...h, cmd].slice(-50));
    setHistIdx(-1);
    setInput("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const idx = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(idx);
      setInput(history[idx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx < 0) return;
      const idx = histIdx + 1;
      if (idx >= history.length) {
        setHistIdx(-1);
        setInput("");
      } else {
        setHistIdx(idx);
        setInput(history[idx]);
      }
    }
  }

  return (
    <div className="flex h-full min-h-[500px] flex-col gap-3">
      {!chatOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="multiple"
            value={levels}
            onValueChange={(v) =>
              setLevels((v.length > 0 ? v : levels) as ConsoleLevel[])
            }
            size="sm"
            variant="outline"
          >
            <ToggleGroupItem value="info">info</ToggleGroupItem>
            <ToggleGroupItem value="warn">warn</ToggleGroupItem>
            <ToggleGroupItem value="error">error</ToggleGroupItem>
            <ToggleGroupItem value="chat">chat</ToggleGroupItem>
          </ToggleGroup>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAutoscroll((v) => !v)}
              title={autoscroll ? "Pause autoscroll" : "Resume autoscroll"}
            >
              {autoscroll ? (
                <PushPinSlash className="h-4 w-4" />
              ) : (
                <PushPin className="h-4 w-4" />
              )}
              {autoscroll ? "Follow" : "Paused"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => viewportRef.current?.scrollTo({ top: 0 })}
            >
              <Broom className="h-4 w-4" />
              Top
            </Button>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 rounded-md border bg-background/50">
        <div
          ref={viewportRef}
          className="h-[60vh] min-h-[400px] overflow-auto p-3 font-mono text-xs leading-relaxed"
        >
          {filtered.map((e) => (
            <div key={e.id} className="flex gap-2">
              <span className="shrink-0 text-muted-foreground/60">
                {new Date(e.ts).toLocaleTimeString()}
              </span>
              <span className={cn("shrink-0 w-14", LEVEL_COLOR[e.level])}>
                [{e.level}]
              </span>
              <span className="shrink-0 text-muted-foreground/80">
                {e.source}
              </span>
              <span className="whitespace-pre-wrap break-all">{e.message}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="py-6 text-center text-muted-foreground">
              No events yet…
            </div>
          )}
        </div>
      </ScrollArea>

      {!chatOnly && (
        <form onSubmit={submit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="RCON command (e.g. status, mp_restartgame 1)"
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" disabled={!input.trim() || rcon.isPending}>
            <PaperPlaneRight className="h-4 w-4" weight="fill" />
            Send
          </Button>
        </form>
      )}
    </div>
  );
}
