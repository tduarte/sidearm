"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowsClockwise,
  ClockCounterClockwise,
  Gauge,
  Gear,
  MapTrifold,
  Moon,
  Pause,
  Play,
  Sliders,
  Sun,
  Terminal,
  Trophy,
  UserMinus,
} from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useSession } from "@/components/session-provider";
import { api } from "@/lib/api/client";
import type { Role } from "@/lib/auth/permissions";
import { useLivePlayers } from "@/lib/hooks/use-live-players";
import { useServerStatus } from "@/lib/hooks/use-server-status";

/**
 * Every destination, filtered by what the account is allowed to reach.
 *
 * A palette that offers a page you will be refused at is worse than one that
 * omits it: you spend the move, land on a wall of 403s, and learn not to trust
 * the palette. The roles here are the same ones `sidebar-nav.tsx` filters on
 * and the same ones the server enforces.
 */
const DESTINATIONS: Array<{
  href: string;
  label: string;
  icon: typeof Gauge;
  role: Role;
}> = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge, role: "viewer" },
  { href: "/match", label: "Match Control", icon: Trophy, role: "moderator" },
  { href: "/maps", label: "Maps", icon: MapTrifold, role: "moderator" },
  { href: "/console", label: "Console", icon: Terminal, role: "moderator" },
  { href: "/config", label: "Config", icon: Sliders, role: "admin" },
  { href: "/history", label: "History", icon: ClockCounterClockwise, role: "viewer" },
  { href: "/settings", label: "Settings", icon: Gear, role: "viewer" },
];

/**
 * One-move reach for the things you need mid-match.
 *
 * Kick lives on the Dashboard, the map on Maps, pause on Match Control and
 * restart in the top bar — four places, which is three too many when someone is
 * griefing and nine people are waiting. `cmdk` was already a dependency and
 * entirely unused.
 *
 * Deliberately does NOT include stop, or applying an update: those drop
 * everyone, and an action that severe should not be two keystrokes and a
 * fuzzy match away.
 */
/**
 * ⌘K is invisible until someone tells you about it, so the top bar has a chip
 * that opens the same palette. An event rather than lifted state: the trigger
 * and the dialog sit in different branches of the shell, and threading a
 * setter through `AppShell` would make every page re-render on open.
 */
const OPEN_EVENT = "sidearm:command-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useSession();
  const { resolvedTheme, setTheme } = useTheme();

  const { data: status } = useServerStatus();
  const { data: players } = useLivePlayers();

  // Only fetched while the palette is open — it is a large-ish list and there
  // is no reason to hold it otherwise.
  const maps = useQuery({
    queryKey: ["maps"],
    queryFn: () => api.getMaps(),
    enabled: open && can("moderator"),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
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
    },
  });

  const act = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const dockerDown = status ? !status.control.docker : false;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Jump to a page or act on the server"
    >
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
          {can("admin") && (
            <CommandItem
              value="rcon run command console"
              onSelect={() => act(() => router.push("/console"))}
            >
              <Terminal className="h-4 w-4" />
              Run an RCON command…
              <span className="ml-auto text-xs text-muted-foreground">
                opens Console
              </span>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Appearance">
          <CommandItem
            value="theme dark light appearance"
            onSelect={() =>
              act(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))
            }
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
            Switch to {resolvedTheme === "dark" ? "light" : "dark"} theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
