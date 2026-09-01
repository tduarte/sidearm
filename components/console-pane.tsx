"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  PaperPlaneRight,
  ArrowLineUp,
  PushPin,
  PushPinSlash,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useCan } from "@/components/session-provider";
import { api } from "@/lib/api/client";
import { useConsoleStream } from "@/lib/hooks/use-console-stream";
import { useConsolePrefs } from "@/lib/hooks/use-console-prefs";
import type { ConsoleLevel } from "@/lib/api/types";

const LEVEL_COLOR: Record<ConsoleLevel, string> = {
  info: "text-muted-foreground",
  warn: "text-warn",
  error: "text-danger",
  chat: "text-ok",
};

export function ConsolePane() {
  const { events, state: streamState, error: streamError } = useConsoleStream();
  const [levels, setLevels] = useState<ConsoleLevel[]>([
    "info",
    "warn",
    "error",
    "chat",
  ]);
  // Derived rather than copied into state: the saved preference is the
  // default, and a toggle in this session overrides it until unmount. The
  // Settings switch that claimed to control this was never wired to anything.
  const { autoscroll: autoscrollDefault } = useConsolePrefs();
  const [autoscrollOverride, setAutoscrollOverride] = useState<boolean | null>(
    null,
  );
  const autoscroll = autoscrollOverride ?? autoscrollDefault;
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  // `/api/rcon` is admin-only, so a moderator reads the log and sends nothing.
  const canSend = useCan("admin");

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
    meta: { action: "Command" },
    // A refused or failed command used to vanish: the input cleared, nothing
    // was echoed, and the denylist rejection in lib/cs2/sanitize.ts never
    // reached the user. Put the command back so it can be corrected.
    onError: (_err, cmd) => setInput(cmd),
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

  /*
   * Fills its parent rather than choosing a height. The log used to be a
   * fixed `60vh` inside an auto-height card, which on a phone pushed the RCON
   * input a full screen below the fold — you had to scroll past an
   * autoscrolling log to reach the only thing on the page you can type into.
   * The page now hands this a definite height and the log takes what is left,
   * so the input sits on the bottom edge at every size.
   */
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
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
            onClick={() => setAutoscrollOverride(!autoscroll)}
            title={autoscroll ? "Pause autoscroll" : "Resume autoscroll"}
          >
            {/*
              Pinned means following. These were the other way round, so the
              only indicator of whether the log was live read as its opposite.
            */}
            {autoscroll ? (
              <PushPin className="h-4 w-4" weight="fill" />
            ) : (
              <PushPinSlash className="h-4 w-4" />
            )}
            {autoscroll ? "Follow" : "Paused"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => viewportRef.current?.scrollTo({ top: 0 })}
          >
            <ArrowLineUp className="h-4 w-4" />
            Top
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 rounded-md border bg-background/50">
        <div
          ref={viewportRef}
          className="h-full overflow-auto p-3 font-mono text-xs leading-relaxed"
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
            <div className="space-y-1 py-6 text-center text-muted-foreground">
              {streamState === "loading" && <p>Loading the log…</p>}
              {streamState === "error" && (
                <>
                  <p className="text-destructive">
                    Could not load the log backlog.
                  </p>
                  <p className="text-xs">{streamError}</p>
                  <p className="text-xs">
                    Live lines will still appear here if the server sends any.
                  </p>
                </>
              )}
              {streamState === "ready" && events.length === 0 && (
                <>
                  <p>Nothing logged yet.</p>
                  <p className="text-xs">
                    The server streams here as it plays. Run a command below to
                    see its reply.
                  </p>
                </>
              )}
              {streamState === "ready" && events.length > 0 && (
                <>
                  <p>No lines match these filters.</p>
                  <p className="text-xs">
                    {events.length} line{events.length === 1 ? "" : "s"} hidden.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {canSend ? (
        <form onSubmit={submit} className="flex shrink-0 gap-2">
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
            <span className="hidden sm:inline">Send</span>
          </Button>
        </form>
      ) : (
        <p className="shrink-0 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Running commands needs an admin account. You can read the log here.
        </p>
      )}
    </div>
  );
}
