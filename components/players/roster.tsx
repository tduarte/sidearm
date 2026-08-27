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
        team === "CT" && "bg-blue-500/15 text-blue-400 border-blue-500/30",
        team === "T" && "bg-amber-500/15 text-amber-400 border-amber-500/30",
        team === "SPEC" && "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
      )}
    >
      {team}
    </Badge>
  );
}

export function Roster() {
  const { data: players, isLoading, error, refetch } = useLivePlayers();
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
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead className="w-20">Team</TableHead>
                  <TableHead className="text-right w-16">K</TableHead>
                  <TableHead className="text-right w-16">D</TableHead>
                  <TableHead className="text-right w-16">A</TableHead>
                  <TableHead className="text-right w-20">Ping</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      {(players?.length ?? 0) === 0 ? (
                        <div className="space-y-1">
                          <p>Nobody is connected.</p>
                          <p className="text-xs">
                            Share the connect URL from the dashboard to get a
                            game going.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p>No player matches “{search}”.</p>
                          <p className="text-xs">
                            {players?.length} connected.
                          </p>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
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
                          <p className="text-xs text-muted-foreground font-mono">
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
                    <TableCell className="text-right tabular-nums">
                      <span className={cn(
                        p.ping > 100 && "text-amber-400",
                        p.ping > 150 && "text-red-400",
                      )}>
                        {p.ping}ms
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <DotsThreeVertical className="h-4 w-4" weight="bold" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              navigator.clipboard.writeText(p.steamId);
                              toast("SteamID copied");
                            }}
                          >
                            <Copy className="h-4 w-4" />
                            Copy SteamID
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setKickTarget(p)}
                            variant="destructive"
                          >
                            <UserMinus className="h-4 w-4" />
                            Kick
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setBanTarget(p)}
                            variant="destructive"
                          >
                            <Prohibit className="h-4 w-4" />
                            Ban
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
