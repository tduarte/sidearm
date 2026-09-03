"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowLineUp,
  ArrowsClockwise,
  MapTrifold,
  PaperPlaneRight,
  Pause,
  Play,
  PushPin,
  PushPinSlash,
  Terminal,
  UserMinus,
} from "@phosphor-icons/react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DESTINATIONS } from "@/components/nav";
import { useSession } from "@/components/session-provider";
import { api } from "@/lib/api/client";
import { useConsolePrefs } from "@/lib/hooks/use-console-prefs";
import { useConsoleStream } from "@/lib/hooks/use-console-stream";
import { useLivePlayers } from "@/lib/hooks/use-live-players";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import { cn } from "@/lib/utils";
import type { ConsoleLevel } from "@/lib/api/types";

/**
 * The launcher, and the console.
 *
 * One-move reach for the things you need mid-match: kick, the map, pause,
 * restart, and every destination in the panel. `cmdk` was already a dependency
 * and entirely unused.
 *
 * The console lives here too, as a *mode* rather than a route. It was a page of
 * its own, which meant reading the log cost you the page you were on — and the
 * one time you want the log is the one time you are in the middle of something
 * else. A launcher you summon over whatever you are doing and dismiss again is
 * the right shape for a thing you consult; a nav entry is the shape for a place
 * you go. So `/console` is gone and this is where it went.
 *
 * Deliberately does NOT include stop, or applying an update: those drop
 * everyone, and an action that severe should not be two keystrokes and a fuzzy
 * match away.
 *
 * **The two halves of console mode need different roles**, which is the one
 * thing to be careful with here. The tail is moderator (`/api/console`, and
 * `wsEventMinRole` filters `console.line` per frame, so a viewer's socket never
 * carries one). The RCON input is admin — `lib/auth/permissions.ts` calls it
 * "an arbitrary-command escape hatch; it is not a moderator tool however
 * carefully `lib/cs2/sanitize.ts` filters it". A viewer is not offered the mode
 * at all.
 */

/**
 * ⌘K is invisible until someone tells you about it, so the rail carries a chip
 * that opens the same palette. An event rather than lifted state: the trigger
 * and the dialog sit in different branches of the shell, and threading a setter
 * through `BroadcastShell` would make every page re-render on open.
 */
const OPEN_EVENT = "sidearm:command-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const LEVEL_COLOR: Record<ConsoleLevel, string> = {
  info: "text-muted-foreground",
  warn: "text-warn",
  error: "text-danger",
  chat: "text-ok",
};

const ALL_LEVELS: ConsoleLevel[] = ["info", "warn", "error", "chat"];

type Mode = "nav" | "console";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("nav");
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useSession();

  const { data: status } = useServerStatus();
  const { data: players } = useLivePlayers();

  // Only fetched while the palette is open — it is a large-ish list and there
  // is no reason to hold it otherwise.
  const maps = useQuery({
    queryKey: ["maps"],
    queryFn: () => api.getMaps(),
    enabled: open && mode === "nav" && can("moderator"),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
        // Every route into the palette lands on the launcher. Reopening
        // straight into a wall of log because that is where you were last time
        // is the palette deciding what you came for.
        setMode("nav");
      }
    };
    const onOpen = () => {
      setOpen(true);
      setMode("nav");
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const kick = useMutation({
    mutationFn: (steamId: string) => api.kick(steamId),
    meta: { action: "Kick" },
    onSuccess: () => {
      toast.success("Player kicked");
      qc.invalidateQueries({ queryKey: ["players"] });
      qc.invalidateQueries({ queryKey: ["status"] });
    },
  });

  const changeMap = useMutation({
    mutationFn: (name: string) => api.changeMap(name),
    meta: { action: "Map change" },
    onSuccess: (_r, name) => {
      toast(`Asked the server to load ${name}`, {
        description: "Workshop maps download first; this can take a minute.",
      });
      qc.invalidateQueries({ queryKey: ["status"] });
      qc.invalidateQueries({ queryKey: ["maps"] });
    },
  });

  const pause = useMutation({
    mutationFn: (action: "pause" | "unpause") => api.setPause(action),
    meta: { action: "Pause" },
    onSuccess: (_r, action) => {
      toast(action === "pause" ? "Pause requested" : "Match resumed");
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const restart = useMutation({
    mutationFn: () => api.restart(),
    meta: { action: "Restart" },
    onSuccess: () => {
      toast.success("Server restarting");
      qc.invalidateQueries({ queryKey: ["status"] });
      qc.invalidateQueries({ queryKey: ["maps"] });
    },
  });

  const act = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const dockerDown = status ? !status.control.docker : false;
  const console_ = mode === "console";

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setMode("nav");
      }}
      title={console_ ? "Console" : "Command palette"}
      description={
        console_
          ? "Live server log, and RCON for admins"
          : "Jump to a page or act on the server"
      }
      // The launcher is a short list near the top of the screen; the console is
      // a log, and a log in a 288px box is a keyhole. Both overrides land
      // because `CommandDialog` and `CommandList` pass `className` through `cn`.
      className={console_ ? "top-1/2 -translate-y-1/2 sm:max-w-3xl" : undefined}
      commandProps={console_ ? { shouldFilter: false } : undefined}
    >
      {console_ ? (
        <ConsoleMode onBack={() => setMode("nav")} />
      ) : (
        <>
          <CommandInput placeholder="Type a map, a player, or an action…" />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>

            {can("moderator") && (
              <CommandGroup heading="Match">
                <CommandItem onSelect={() => act(() => pause.mutate("pause"))}>
                  <Pause className="h-4 w-4" />
                  Pause match
                  <span className="ml-auto text-xs text-muted-foreground">
                    at round end
                  </span>
                </CommandItem>
                <CommandItem onSelect={() => act(() => pause.mutate("unpause"))}>
                  <Play className="h-4 w-4" />
                  Resume match
                </CommandItem>
                {can("admin") && (
                  <CommandItem
                    disabled={dockerDown}
                    onSelect={() => act(() => restart.mutate())}
                  >
                    <ArrowsClockwise className="h-4 w-4" />
                    Restart the server
                    <span className="ml-auto text-xs text-muted-foreground">
                      {dockerDown ? "Docker unreachable" : "drops everyone"}
                    </span>
                  </CommandItem>
                )}
              </CommandGroup>
            )}

            {/*
              The console does not close the palette — it takes it over. That is
              the difference between it and everything else in this list: the
              others are one move and you are done, this is a place you stay for
              a minute and then dismiss.
            */}
            {can("moderator") && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Console">
                  <CommandItem
                    value="console log rcon command output tail"
                    onSelect={() => setMode("console")}
                  >
                    <Terminal className="h-4 w-4" />
                    {can("admin") ? "Console and RCON" : "Console"}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {can("admin") ? "read and run" : "read only"}
                    </span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}

            {can("moderator") && (players?.length ?? 0) > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Kick">
                  {players?.map((p) => (
                    <CommandItem
                      key={p.steamId}
                      value={`kick ${p.name}`}
                      onSelect={() => act(() => kick.mutate(p.steamId))}
                    >
                      <UserMinus className="h-4 w-4" />
                      {p.name}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {p.team} · {p.ping}ms
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {can("moderator") && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Change map">
                  {(maps.data?.all ?? []).map((m) => (
                    <CommandItem
                      key={m.name}
                      value={`map ${m.displayName} ${m.name}`}
                      disabled={m.name === status?.map}
                      onSelect={() => act(() => changeMap.mutate(m.name))}
                    >
                      <MapTrifold className="h-4 w-4" />
                      {m.displayName}
                      <span className="ml-auto font-mono text-xs text-muted-foreground">
                        {m.name === status?.map ? "current" : m.type}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            <CommandSeparator />
            <CommandGroup heading="Go to">
              {DESTINATIONS.filter((d) => can(d.role)).map(
                ({ href, label, icon: Icon }) => (
                  <CommandItem
                    key={href}
                    value={`go ${label}`}
                    onSelect={() => act(() => router.push(href))}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </CommandItem>
                ),
              )}
            </CommandGroup>
          </CommandList>
        </>
      )}
    </CommandDialog>
  );
}

/**
 * The console, inside the palette.
 *
 * Ported from the page that used to hold it. The height is explicit rather than
 * `flex-1`: the dialog sizes to its content, so "fill the parent" resolves to
 * "be as tall as the log", which for a 2000-line ring is the whole document.
 */
function ConsoleMode({ onBack }: { onBack: () => void }) {
  const { events, state: streamState, error: streamError } = useConsoleStream();
  const [levels, setLevels] = useState<ConsoleLevel[]>(ALL_LEVELS);
  /**
   * The persisted preference itself, not a session override of it. It used to
   * be a switch on Settings — a page away from the only thing it affects, where
   * you would have to already know the console had a follow mode to go looking
   * for it. Toggling it here is the same act as setting it.
   */
  const { autoscroll, setAutoscroll } = useConsolePrefs();
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  // `/api/rcon` is admin-only, so a moderator reads the log and sends nothing.
  const canSend = useSession().can("admin");

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
    /*
     * `cmdk` owns ArrowUp/ArrowDown/Home/End/Enter on its root to move between
     * items, and this input is a descendant of it. Without this the up arrow
     * moves a selection in a list that is not rendered and never reaches the
     * command history — so the history exists and cannot be used.
     *
     * Escape is deliberately let through: it should close the palette, which is
     * what Radix does with it.
     */
    if (["ArrowUp", "ArrowDown", "Home", "End", "Enter"].includes(e.key)) {
      e.stopPropagation();
    }
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
    <div className="flex h-[70svh] max-h-[36rem] min-h-0 flex-col gap-3 p-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        <ToggleGroup
          type="multiple"
          value={levels}
          onValueChange={(v) =>
            setLevels((v.length > 0 ? v : levels) as ConsoleLevel[])
          }
          size="sm"
          variant="outline"
        >
          {ALL_LEVELS.map((level) => (
            <ToggleGroupItem key={level} value={level}>
              {level}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAutoscroll(!autoscroll)}
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
            <span className="hidden sm:inline">
              {autoscroll ? "Follow" : "Paused"}
            </span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => viewportRef.current?.scrollTo({ top: 0 })}
          >
            <ArrowLineUp className="h-4 w-4" />
            <span className="hidden sm:inline">Top</span>
          </Button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="min-h-0 flex-1 overflow-auto border bg-background/50 p-3 font-mono text-xs leading-relaxed"
      >
        {filtered.map((e) => (
          <div key={e.id} className="flex gap-2">
            <span className="shrink-0 text-muted-foreground/60">
              {new Date(e.ts).toLocaleTimeString()}
            </span>
            <span className={cn("w-14 shrink-0", LEVEL_COLOR[e.level])}>
              [{e.level}]
            </span>
            <span className="shrink-0 text-muted-foreground/80">{e.source}</span>
            <span className="break-all whitespace-pre-wrap">{e.message}</span>
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

      {canSend ? (
        <form onSubmit={submit} className="flex shrink-0 gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="RCON command (e.g. status, mp_restartgame 1)"
            className="font-mono"
            autoComplete="off"
            autoFocus
            spellCheck={false}
          />
          <Button type="submit" disabled={!input.trim() || rcon.isPending}>
            <PaperPlaneRight className="h-4 w-4" weight="fill" />
            <span className="hidden sm:inline">Send</span>
          </Button>
        </form>
      ) : (
        <p className="shrink-0 border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Running commands needs an admin account. You can read the log here.
        </p>
      )}
    </div>
  );
}
