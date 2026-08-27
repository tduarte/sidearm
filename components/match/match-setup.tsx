"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowClockwise,
  FlagCheckered,
  Play,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DangerConfirm } from "@/components/danger-confirm";
import { api } from "@/lib/api/client";
import { useLivePlayers } from "@/lib/hooks/use-live-players";
import { useMatchState } from "@/lib/hooks/use-match-state";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import { isConvertibleSteamId } from "@/lib/cs2/steamid";
import { cn } from "@/lib/utils";
import type { MatchDefinition } from "@/lib/cs2/match-config";

/** Which side of the setup a player has been put on. */
type Side = "none" | "team1" | "team2";

/**
 * Human-readable labels for MatchZy's gamestate.
 *
 * `none` never reaches here — the card only shows a running match when
 * something is actually loaded.
 */
const STATE_LABEL: Record<string, string> = {
  pending_restore: "Restoring a round backup",
  waiting_for_players: "Waiting for players",
  warmup: "Warmup — waiting for teams to ready up",
  knife: "Knife round",
  waiting_for_knife_decision: "Knife won — waiting for a side decision",
  going_live: "Going live",
  live: "Live",
  post_game: "Match over",
};

export function MatchSetup() {
  const qc = useQueryClient();
  const { data: status } = useServerStatus();
  const { data: match } = useMatchState();
  const { data: players = [] } = useLivePlayers();

  const matchzyUp = status?.plugins?.matchzy === true;
  const loadedState = match?.matchzyState ?? null;
  const running = loadedState !== null && loadedState !== "none";

  const saved = useQuery({
    queryKey: ["matches"],
    queryFn: () => api.getMatchConfigs(),
    // Pointless traffic on the overwhelming majority of servers, which have no
    // plugin and can never run one of these.
    enabled: matchzyUp,
  });

  const [name, setName] = useState("");
  const [team1, setTeam1] = useState("Team A");
  const [team2, setTeam2] = useState("Team B");
  const [sides, setSides] = useState<Record<string, Side>>({});
  const [maps, setMaps] = useState<string[]>([]);
  const [numMaps, setNumMaps] = useState(1);
  const [skipVeto, setSkipVeto] = useState(true);
  const [clinch, setClinch] = useState(true);

  const mapList = useQuery({
    queryKey: ["maps"],
    queryFn: () => api.getMaps(),
    enabled: matchzyUp,
  });

  // Bots have no Steam identity, so they cannot be on a roster — MatchZy would
  // simply never recognise them and the match would never ready up. Shown
  // anyway, greyed, because "where did my bots go" is a worse question than
  // "why can't I pick them".
  const eligible = useMemo(
    () => players.filter((p) => isConvertibleSteamId(p.steamId)),
    [players],
  );
  const ineligible = players.length - eligible.length;

  const definition = (): MatchDefinition => ({
    id: name.trim(),
    // Assigned server-side; MatchZy needs an integer and the operator does not
    // need to know that.
    matchNumber: 0,
    team1: {
      name: team1,
      players: eligible
        .filter((p) => sides[p.steamId] === "team1")
        .map((p) => ({ steamId: p.steamId, name: p.name })),
    },
    team2: {
      name: team2,
      players: eligible
        .filter((p) => sides[p.steamId] === "team2")
        .map((p) => ({ steamId: p.steamId, name: p.name })),
    },
    maps,
    numMaps,
    playersPerTeam: Math.max(
      1,
      eligible.filter((p) => sides[p.steamId] === "team1").length,
      eligible.filter((p) => sides[p.steamId] === "team2").length,
    ),
    minPlayersToReady: 1,
    skipVeto,
    clinchSeries: clinch,
    wingman: false,
  });

  const save = useMutation({
    mutationFn: () => api.saveMatch(definition()),
    meta: { action: "Saving the match setup" },
    onSuccess: ({ warnings }) => {
      toast.success("Match setup saved");
      // Warnings are things the operator asked for that will not happen. Shown
      // separately and persistently, because they are easy to miss under a
      // success toast and only matter before the match starts.
      for (const w of warnings) toast.warning(w, { duration: 10000 });
      qc.invalidateQueries({ queryKey: ["matches"] });
    },
  });

  const load = useMutation({
    mutationFn: (id: string) => api.loadMatch(id),
    meta: { action: "Loading the match" },
    onSuccess: () => {
      toast.success("Match loading", {
        description:
          "MatchZy is changing the map and starting warmup. Players ready up with .ready in chat.",
      });
      qc.invalidateQueries({ queryKey: ["matches"] });
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const end = useMutation({
    mutationFn: () => api.endMatch(),
    meta: { action: "Ending the match" },
    onSuccess: () => {
      toast.success("Match ended");
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteMatch(id),
    meta: { action: "Deleting the match setup" },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["matches"] }),
  });

  if (!matchzyUp) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Run a match</CardTitle>
          <CardDescription>
            Needs MatchZy, which is not loaded on this server. Without it the
            panel can set up a knife round with cvars but cannot run a match
            flow — no veto, no ready-up, no backups.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (running) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Match in progress</CardTitle>
            <Badge variant="outline" className="gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              {STATE_LABEL[loadedState] ?? loadedState}
            </Badge>
          </div>
          <CardDescription>
            MatchZy is running this match, so it owns the map cycle, the
            gameplay cvars and demo recording. The panel&apos;s own controls for
            those stand down until it finishes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DangerConfirm
            title="End the match?"
            consequence="MatchZy stops the match immediately and returns the server to warmup. The result is not recorded."
            operation="css_endmatch"
            confirmLabel="End it"
            onConfirm={() => end.mutate()}
          >
            {(arm) => (
              <Button variant="destructive" onClick={arm} disabled={end.isPending}>
                <FlagCheckered className="h-4 w-4" />
                End match
              </Button>
            )}
          </DangerConfirm>
        </CardContent>
      </Card>
    );
  }

  const cycle = (steamId: string) =>
    setSides((prev) => {
      const next: Side =
        prev[steamId] === "team1"
          ? "team2"
          : prev[steamId] === "team2"
            ? "none"
            : "team1";
      return { ...prev, [steamId]: next };
    });

  const allMaps = mapList.data?.all ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Run a match</CardTitle>
        <CardDescription>
          MatchZy handles the veto, the knife round, ready-up and round backups.
          Loading a match changes the map and restarts the game for everyone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {saved.data && saved.data.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Saved setups
            </Label>
            <ul className="divide-y rounded-md border">
              {saved.data.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.id}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.definition.team1.name} vs {m.definition.team2.name} ·
                      BO{m.definition.numMaps} ·{" "}
                      {m.definition.maps.join(", ") || "no maps"}
                      {m.loadedAt ? " · loaded before" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <DangerConfirm
                      title={`Load ${m.id}?`}
                      consequence="MatchZy changes the map and restarts the game. Anyone connected is put into warmup and has to ready up before it starts."
                      operation="matchzy_loadmatch_url"
                      confirmLabel="Load it"
                      onConfirm={() => load.mutate(m.id)}
                    >
                      {(arm) => (
                        <Button size="sm" onClick={arm} disabled={load.isPending}>
                          <Play className="h-4 w-4" />
                          Load
                        </Button>
                      )}
                    </DangerConfirm>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${m.id}`}
                      onClick={() => remove.mutate(m.id)}
                      disabled={remove.isPending}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="match-name">Setup name</Label>
            <Input
              id="match-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="friday-scrim"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team1">Team 1</Label>
            <Input id="team1" value={team1} onChange={(e) => setTeam1(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team2">Team 2</Label>
            <Input id="team2" value={team2} onChange={(e) => setTeam2(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Teams — click a player to move them
          </Label>
          {players.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
              Nobody is connected. Players have to be on the server to be put on
              a team — MatchZy identifies them by Steam ID.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {eligible.map((p) => {
                const side = sides[p.steamId] ?? "none";
                return (
                  <button
                    key={p.steamId}
                    type="button"
                    onClick={() => cycle(p.steamId)}
                    aria-pressed={side !== "none"}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-sm transition-colors",
                      side === "none" && "text-muted-foreground hover:bg-muted",
                      side === "team1" && "border-primary/50 bg-primary/10 text-foreground",
                      side === "team2" && "border-sky-500/50 bg-sky-500/10 text-foreground",
                    )}
                  >
                    {p.name}
                    {side !== "none" && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {side === "team1" ? team1 : team2}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {ineligible > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Warning className="h-3.5 w-3.5" />
              {ineligible} bot{ineligible === 1 ? "" : "s"} hidden — bots have no
              Steam ID and cannot be on a match roster.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Map pool
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {allMaps.map((m) => {
              const picked = maps.includes(m.name);
              return (
                <button
                  key={m.name}
                  type="button"
                  aria-pressed={picked}
                  onClick={() =>
                    setMaps((prev) =>
                      prev.includes(m.name)
                        ? prev.filter((x) => x !== m.name)
                        : [...prev, m.name],
                    )
                  }
                  className={cn(
                    "rounded-md border px-2.5 py-1 font-mono text-xs transition-colors",
                    picked
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {m.displayName}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="num-maps">Series</Label>
            <Select
              value={String(numMaps)}
              onValueChange={(v) => setNumMaps(Number(v))}
            >
              <SelectTrigger id="num-maps">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Best of 1</SelectItem>
                <SelectItem value="3">Best of 3</SelectItem>
                <SelectItem value="5">Best of 5</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-md border px-3">
            <div className="py-2">
              <Label htmlFor="skip-veto">Skip the veto</Label>
              <p className="text-xs text-muted-foreground">
                Use the pool in order
              </p>
            </div>
            <Switch id="skip-veto" checked={skipVeto} onCheckedChange={setSkipVeto} />
          </div>
          <div className="flex items-center justify-between gap-2 rounded-md border px-3">
            <div className="py-2">
              <Label htmlFor="clinch">Clinch the series</Label>
              <p className="text-xs text-muted-foreground">
                Stop once it is decided
              </p>
            </div>
            <Switch id="clinch" checked={clinch} onCheckedChange={setClinch} />
          </div>
        </div>

        {/*
          The one rule that is silent on the server: with exactly as many maps
          as the series length there is nothing left to veto, so MatchZy skips
          it whatever was asked for. Said here rather than only in the save
          warning, so it is visible while the pool is being picked.
        */}
        {!skipVeto && maps.length === numMaps && maps.length > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Warning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {maps.length} map{maps.length === 1 ? "" : "s"} in a best-of-
            {numMaps} leaves nothing to veto, so MatchZy will skip it anyway.
            Add more maps to hold a veto.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? (
              <ArrowClockwise className="h-4 w-4 animate-spin" />
            ) : null}
            Save setup
          </Button>
          <p className="text-xs text-muted-foreground">
            Saved setups can be loaded from the list above.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
