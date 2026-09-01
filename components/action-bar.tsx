"use client";

/**
 * The intervention bar: the four things you do to a match in progress, in
 * thumb reach, on a phone.
 *
 * This is the scene the panel exists for. Someone is griefing, or the map is
 * stuck, and the person who can fix it is holding a phone and standing up. On
 * every other surface those actions are reached by opening the sidebar,
 * choosing a page, scrolling, and finding a control near the top of the
 * viewport — four moves, all of them at the far end of the screen from where a
 * thumb rests.
 *
 * So: fixed to the bottom edge, `<md` only (a mouse has no reach problem),
 * moderator and up, and each action one tap from a decision. Pause and Restart
 * are direct; Map and Kick open a sheet from the same edge, so the list you
 * pick from appears under your thumb rather than above it.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Pause,
  Play,
  MapTrifold,
  UserMinus,
  DotsThreeOutline,
  ArrowClockwise,
  CircleNotch,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DangerConfirm } from "@/components/danger-confirm";
import { useCan } from "@/components/session-provider";
import { useMatchState } from "@/lib/hooks/use-match-state";
import { useLivePlayers } from "@/lib/hooks/use-live-players";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Sheeted = "map" | "kick" | "more" | null;

/**
 * One slot in the bar. Deliberately tall (h-14) and equal-width: these are
 * touch targets first and buttons second, and an uneven row invites the
 * mis-taps this surface exists to avoid.
 */
function BarButton({
  label,
  icon: Icon,
  onClick,
  pending,
  tone,
  disabled,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string; weight?: "bold" | "fill" }>;
  onClick: () => void;
  pending?: boolean;
  tone?: "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      className={cn(
        "flex h-14 flex-1 flex-col items-center justify-center gap-1 rounded-md text-[0.6875rem] font-medium",
        "transition-colors active:bg-accent disabled:opacity-40",
        tone === "danger" ? "text-danger" : "text-foreground",
      )}
    >
      {pending ? (
        <CircleNotch className="size-5 animate-spin" />
      ) : (
        <Icon className="size-5" weight="bold" />
      )}
      {label}
    </button>
  );
}

export function ActionBar() {
  const canModerate = useCan("moderator");
  const canAdmin = useCan("admin");
  const [sheet, setSheet] = useState<Sheeted>(null);
  /**
   * Which player the kick sheet is asking about. A scrolling list under a thumb
   * is easy to mis-tap, so a row arms in place rather than firing — but it
   * arms in place rather than opening a dialog, because a second surface would
   * cost the move this whole bar exists to save.
   */
  const [armed, setArmed] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: match } = useMatchState();
  const { data: status } = useServerStatus();
  const { data: players } = useLivePlayers();

  const pause = useMutation({
    mutationFn: (action: "pause" | "unpause") => api.setPause(action),
    meta: { action: "Pause" },
    onSuccess: (next) => {
      // CS2 applies mp_pause_match at the end of the round, so the honest
      // report is what was asked for, not what is true yet.
      toast.success(
        next.pause === "pause_requested"
          ? "Pause requested — it lands at the end of this round"
          : next.pause === "paused"
            ? "Match paused"
            : "Match resumed",
      );
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const changeMap = useMutation({
    mutationFn: (name: string) => api.changeMap(name),
    meta: { action: "Change map" },
    onSuccess: (_r, name) => {
      toast.success(`Loading ${name}`, {
        description: "Workshop maps download first — allow about a minute.",
      });
      setSheet(null);
      qc.invalidateQueries({ queryKey: ["status"] });
      qc.invalidateQueries({ queryKey: ["maps"] });
    },
  });

  const kick = useMutation({
    mutationFn: (steamId: string) => api.kick(steamId),
    meta: { action: "Kick" },
    onSuccess: () => {
      toast.success("Player kicked");
      setSheet(null);
      setArmed(null);
      qc.invalidateQueries({ queryKey: ["players"] });
      qc.invalidateQueries({ queryKey: ["status"] });
    },
  });

  const restart = useMutation({
    mutationFn: () => api.restart(),
    meta: { action: "Restart" },
    onSuccess: () => {
      toast.success("Restarting the server");
      qc.invalidateQueries({ queryKey: ["status"] });
    },
  });

  // Only loaded when the sheet is open: the bar is mounted on every page, and
  // the map list is the one thing here that is not already in the cache.
  const maps = useQuery({
    queryKey: ["maps"],
    queryFn: () => api.getMaps(),
    enabled: sheet === "map",
  });

  if (!canModerate) return null;

  const paused = match?.pause === "paused";
  const pausePending = pause.isPending || match?.pause === "pause_requested";

  return (
    <>
      {/*
        `pb-[env(safe-area-inset-bottom)]` keeps the row clear of the home
        indicator on a notched phone, where the bottom ~34px are not tappable.
      */}
      <nav
        aria-label="Match actions"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="flex items-stretch gap-1 px-2 py-1">
          <BarButton
            label={paused ? "Resume" : "Pause"}
            icon={paused ? Play : Pause}
            pending={pausePending}
            onClick={() => pause.mutate(paused ? "unpause" : "pause")}
          />
          <BarButton
            label="Map"
            icon={MapTrifold}
            onClick={() => setSheet("map")}
            pending={changeMap.isPending}
          />
          <BarButton
            label="Kick"
            icon={UserMinus}
            tone="danger"
            onClick={() => setSheet("kick")}
            pending={kick.isPending}
          />
          <BarButton
            label="More"
            icon={DotsThreeOutline}
            onClick={() => setSheet("more")}
          />
        </div>
      </nav>

      <Sheet open={sheet === "map"} onOpenChange={(o) => !o && setSheet(null)}>
        <SheetContent side="bottom" className="max-h-[80svh] overflow-auto">
          <SheetHeader>
            <SheetTitle>Change map</SheetTitle>
            <SheetDescription>
              Loading a map ends the current round and returns everyone to
              warmup.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4 pb-6">
            {maps.isPending ? (
              Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12 rounded-md" />
              ))
            ) : (
              (maps.data?.all ?? []).map((m) => {
                const current = m.name === maps.data?.current;
                return (
                  <button
                    key={m.name}
                    type="button"
                    disabled={current || changeMap.isPending}
                    onClick={() => changeMap.mutate(m.name)}
                    className="flex h-12 items-center justify-between rounded-md px-3 text-left text-sm active:bg-accent disabled:opacity-60"
                  >
                    <span className="truncate font-medium">
                      {m.displayName ?? m.name}
                    </span>
                    {current ? (
                      <Badge variant="outline" className="shrink-0">
                        On now
                      </Badge>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={sheet === "kick"}
        onOpenChange={(o) => {
          if (!o) {
            setSheet(null);
            setArmed(null);
          }
        }}
      >
        <SheetContent side="bottom" className="max-h-[80svh] overflow-auto">
          <SheetHeader>
            <SheetTitle>Kick a player</SheetTitle>
            <SheetDescription>
              They leave immediately and can rejoin straight away — a kick is
              not a ban.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4 pb-6">
            {(players ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nobody is connected.
              </p>
            ) : (
              (players ?? []).map((p) => {
                const isArmed = armed === p.steamId;
                return (
                  <div
                    key={p.steamId}
                    className={cn(
                      "flex h-14 items-center gap-2 rounded-md px-3",
                      isArmed && "bg-danger/10",
                    )}
                  >
                    <button
                      type="button"
                      disabled={kick.isPending}
                      onClick={() => setArmed(isArmed ? null : p.steamId)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {p.name}
                        </span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {p.team} · {p.k}/{p.d}/{p.a} · {p.ping}ms
                        </span>
                      </span>
                      {!isArmed && (
                        <UserMinus className="size-5 shrink-0 text-danger" />
                      )}
                    </button>
                    {isArmed && (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={kick.isPending}
                        onClick={() => kick.mutate(p.steamId)}
                      >
                        Kick
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={sheet === "more"} onOpenChange={(o) => !o && setSheet(null)}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>More actions</SheetTitle>
            <SheetDescription>
              {status
                ? `${status.players} connected · ${status.map}`
                : "Reading server state…"}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4 pb-6">
            {canAdmin ? (
              <DangerConfirm
                title="Restart the server?"
                consequence="Everyone is disconnected and the match in progress is lost."
                operation="docker restart cs2"
                confirmLabel="Restart"
                onConfirm={() => {
                  setSheet(null);
                  restart.mutate();
                }}
              >
                {(arm) => (
                  <Button
                    variant="outline"
                    className="h-12 w-full justify-start gap-3 text-danger"
                    onClick={arm}
                    disabled={restart.isPending}
                  >
                    <ArrowClockwise className="size-5" />
                    Restart server
                  </Button>
                )}
              </DangerConfirm>
            ) : (
              <p className="py-4 text-sm text-muted-foreground">
                Restarting the server needs an admin account.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
