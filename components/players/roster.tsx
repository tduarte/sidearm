"use client";

/**
 * The live roster, with the actions that go with it.
 *
 * This was the whole of `/players`. It lives on Ops now because the three
 * moments the panel is for — a griefer mid-match, a stuck map, a server that
 * will not start — all begin by looking at who is on, and kicking someone was
 * a navigation away from the screen you were already watching.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DotsThreeVertical, UserMinus, Prohibit, Copy } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadError } from "@/components/load-error";
import { BanDialog } from "@/components/players/ban-dialog";
import { BanList } from "@/components/players/ban-list";
import { useCan } from "@/components/session-provider";
import { api } from "@/lib/api/client";
import { useLivePlayers } from "@/lib/hooks/use-live-players";
import type { Player } from "@/lib/api/types";
import { cn } from "@/lib/utils";

function TeamBadge({ team }: { team: Player["team"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        team === "CT" && "bg-team-ct/12 text-team-ct border-team-ct/30",
        team === "T" && "bg-team-t/12 text-team-t border-team-t/30",
        team === "SPEC" && "bg-unknown/12 text-unknown border-unknown/30",
      )}
    >
      {team}
    </Badge>
  );
}


/**
 * The per-player menu, shared by the table row and the mobile card so the two
 * layouts can never drift into offering different actions.
 *
 * Kick and ban are hidden, not disabled, for viewers: a viewer can never
 * acquire the permission by waiting, so a greyed-out button would only be a
 * question the UI refuses to answer. Copy SteamID stays — it is the one thing
 * on this menu a viewer is allowed to do, and it is why they open the menu.
 */
function PlayerActions({
  player,
  canModerate,
  onKick,
  onBan,
}: {
  player: Player;
  canModerate: boolean;
  onKick: (p: Player) => void;
  onBan: (p: Player) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Actions for ${player.name}`}
        >
          <DotsThreeVertical className="h-4 w-4" weight="bold" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            navigator.clipboard.writeText(player.steamId);
            toast("SteamID copied");
          }}
        >
          <Copy className="h-4 w-4" />
          Copy SteamID
        </DropdownMenuItem>
        {canModerate && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onKick(player)} variant="destructive">
              <UserMinus className="h-4 w-4" />
              Kick
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onBan(player)} variant="destructive">
              <Prohibit className="h-4 w-4" />
              Ban
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Ping is the one number here that means something on its own. */
function pingClass(ping: number): string {
  if (ping > 150) return "text-danger";
  if (ping > 100) return "text-warn";
  return "";
}

export function Roster() {
  const { data: players, isLoading, error, refetch } = useLivePlayers();
  const canModerate = useCan("moderator");
  const [search, setSearch] = useState("");
  const [kickTarget, setKickTarget] = useState<Player | null>(null);
  const [banTarget, setBanTarget] = useState<Player | null>(null);
  const qc = useQueryClient();

  const kick = useMutation({
    mutationFn: (steamId: string) => api.kick(steamId),
    meta: { action: "Kick" },
    onSuccess: () => {
      toast.success("Player kicked");
      qc.invalidateQueries({ queryKey: ["players"] });
      qc.invalidateQueries({ queryKey: ["status"] });
    },
  });

  const ban = useMutation({
    mutationFn: ({
      steamId,
      minutes,
      reason,
    }: {
      steamId: string;
      minutes: number | null;
      reason: string;
    }) => api.banPlayer(steamId, minutes, reason),
    meta: { action: "Ban" },
    onSuccess: (record) => {
      toast.success(`${record.name} banned`, {
        description: record.expiresAt
          ? `Until ${new Date(record.expiresAt).toLocaleString()}`
          : "No expiry — lift it from the ban list.",
      });
      setBanTarget(null);
      qc.invalidateQueries({ queryKey: ["players"] });
      qc.invalidateQueries({ queryKey: ["bans"] });
      qc.invalidateQueries({ queryKey: ["status"] });
    },
  });

  const filtered = (players ?? []).filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const ct = filtered.filter((p) => p.team === "CT");
  const t = filtered.filter((p) => p.team === "T");
  const spec = filtered.filter((p) => p.team === "SPEC");

  return (
    <div className="space-y-4">
      {error && !players ? (
        <LoadError what="the roster" error={error} onRetry={() => refetch()} />
      ) : null}

      <Card>
        {/*
          Sticky, because this is now the anchor of a long page: the counts and
          the search field have to stay reachable while scrolling the roster.
        */}
        <CardHeader className="sticky top-0 z-10 gap-3 border-b bg-card pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Roster</CardTitle>
              <p className="text-sm text-muted-foreground">
                {players?.length ?? 0} connected · CT {ct.length} · T {t.length}
                {spec.length ? ` · Spec ${spec.length}` : ""}
              </p>
            </div>
            <Input
              placeholder="Search name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="px-0 md:px-6">
          {isLoading ? (
            <div className="space-y-3 px-4 md:px-0">
              {/* Shaped like the rows it replaces, so the card does not jump. */}
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                  <Skeleton className="h-5 w-10" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground md:px-0">
              {(players?.length ?? 0) === 0 ? (
                <div className="space-y-1">
                  <p>Nobody is connected.</p>
                  <p className="text-xs">
                    Share the connect URL from the dashboard to get a game going.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p>No player matches \u201C{search}\u201D.</p>
                  <p className="text-xs">{players?.length} connected.</p>
                </div>
              )}
            </div>
          ) : (
            <>
              {/*
                Two layouts, not one that stretches. The seven-column table put
                Ping past the right edge of a phone, so the number that tells you
                someone is lagging was the one column you could not read. Under
                `md` each player becomes a card: identity on top, the numbers on
                a labelled strip below.
              */}
              <ul className="divide-y md:hidden">
                {filtered.map((p) => (
                  <li key={p.steamId} className="flex items-start gap-3 px-4 py-3">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="text-xs">
                        {p.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium leading-tight">{p.name}</p>
                        <TeamBadge team={p.team} />
                      </div>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {p.steamId}
                      </p>
                      <dl className="flex items-center gap-4 text-xs text-muted-foreground">
                        {([
                          ["K", p.k],
                          ["D", p.d],
                          ["A", p.a],
                        ] as const).map(([label, value]) => (
                          <div key={label} className="flex items-baseline gap-1">
                            <dt>{label}</dt>
                            <dd className="font-medium tabular-nums text-foreground">
                              {value}
                            </dd>
                          </div>
                        ))}
                        <div className="flex items-baseline gap-1">
                          <dt>Ping</dt>
                          <dd
                            className={cn(
                              "font-medium tabular-nums text-foreground",
                              pingClass(p.ping),
                            )}
                          >
                            {p.ping}ms
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <PlayerActions
                      player={p}
                      canModerate={canModerate}
                      onKick={setKickTarget}
                      onBan={setBanTarget}
                    />
                  </li>
                ))}
              </ul>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead className="w-20">Team</TableHead>
                      <TableHead className="w-16 text-right">K</TableHead>
                      <TableHead className="w-16 text-right">D</TableHead>
                      <TableHead className="w-16 text-right">A</TableHead>
                      <TableHead className="w-20 text-right">Ping</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <TableRow key={p.steamId}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">
                                {p.name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium leading-tight">{p.name}</p>
                              <p className="font-mono text-xs text-muted-foreground">
                                {p.steamId}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <TeamBadge team={p.team} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{p.k}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.d}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.a}</TableCell>
                        <TableCell
                          className={cn("text-right tabular-nums", pingClass(p.ping))}
                        >
                          {p.ping}ms
                        </TableCell>
                        <TableCell>
                          <PlayerActions
                            player={p}
                            canModerate={canModerate}
                            onKick={setKickTarget}
                            onBan={setBanTarget}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <BanList />

      <BanDialog
        player={banTarget}
        pending={ban.isPending}
        onOpenChange={(open) => !open && setBanTarget(null)}
        onConfirm={(minutes, reason) => {
          if (banTarget) {
            ban.mutate({ steamId: banTarget.steamId, minutes, reason });
          }
        }}
      />

      <AlertDialog open={!!kickTarget} onOpenChange={(o) => !o && setKickTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kick {kickTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  They are removed from the match immediately and can rejoin
                  straight away — a kick is not a ban.
                </p>
                {kickTarget && (
                  <p className="font-mono text-xs text-muted-foreground">
                    {kickTarget.team} · {kickTarget.k}/{kickTarget.d}/
                    {kickTarget.a} · {kickTarget.ping}ms ·{" "}
                    {kickTarget.steamId}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (kickTarget) kick.mutate(kickTarget.steamId);
                setKickTarget(null);
              }}
            >
              Kick player
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
