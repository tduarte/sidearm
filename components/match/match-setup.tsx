"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowClockwise,
  Play,
  Trash,
  Warning,
} from "@phosphor-icons/react";
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
import { TeamBuilder, type TeamEntry } from "@/components/match/team-builder";
import { api } from "@/lib/api/client";
import { useLivePlayers } from "@/lib/hooks/use-live-players";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import { isConvertibleSteamId } from "@/lib/cs2/steamid";
import { MapPoolPicker } from "@/components/match/map-pool-picker";
import type { MatchDefinition } from "@/lib/cs2/match-config";
import type { StoredMatchConfig } from "@/lib/db/match-configs";

/** A player on a roster, before we know whether they are on the server now. */
type RosterMember = { id: string; name: string };

export function MatchSetup() {
  const qc = useQueryClient();
  const { data: status } = useServerStatus();
  const { data: players = [] } = useLivePlayers();

  const matchzyUp = status?.plugins?.matchzy === true;

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
  const [roster1, setRoster1] = useState<RosterMember[]>([]);
  const [roster2, setRoster2] = useState<RosterMember[]>([]);
  const [maps, setMaps] = useState<string[]>([]);
  const [numMaps, setNumMaps] = useState(1);
  const [skipVeto, setSkipVeto] = useState(true);
  const [clinch, setClinch] = useState(true);

  const mapList = useQuery({
    queryKey: ["maps"],
    queryFn: () => api.getMaps(),
    enabled: matchzyUp,
  });

  const allMaps = useMemo(() => mapList.data?.all ?? [], [mapList.data]);

  // Newest first — the one you ran last is the one you most likely want again.
  const templates = useMemo(
    () =>
      [...(saved.data ?? [])].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    [saved.data],
  );

  const applyTemplate = (t: StoredMatchConfig) => {
    const d = t.definition;
    setName(d.id);
    setTeam1(d.team1.name);
    setTeam2(d.team2.name);
    setRoster1(d.team1.players.map((p) => ({ id: p.steamId, name: p.name })));
    setRoster2(d.team2.players.map((p) => ({ id: p.steamId, name: p.name })));
    setMaps(d.maps);
    setNumMaps(d.numMaps);
    setSkipVeto(d.skipVeto);
    setClinch(d.clinchSeries);
  };

  // Never start from blank. The form seeds itself from the most recent setup
  // the first time one arrives — same friends, same pool, most nights — and
  // then leaves the operator alone, so a later refetch cannot stamp on what
  // they are in the middle of typing.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || templates.length === 0) return;
    seeded.current = true;
    applyTemplate(templates[0]);
  }, [templates]);

  // Bots have no Steam identity, so they cannot be on a roster — MatchZy would
  // simply never recognise them and the match would never ready up. Counted
  // and explained rather than silently dropped.
  const eligible = useMemo(
    () => players.filter((p) => isConvertibleSteamId(p.steamId)),
    [players],
  );
  const ineligible = players.length - eligible.length;

  const connectedIds = useMemo(
    () => new Set(eligible.map((p) => p.steamId)),
    [eligible],
  );
  const rostered = useMemo(
    () => new Set([...roster1, ...roster2].map((p) => p.id)),
    [roster1, roster2],
  );
  const pool = useMemo(
    () =>
      eligible
        .filter((p) => !rostered.has(p.steamId))
        .map((p) => ({ id: p.steamId, name: p.name })),
    [eligible, rostered],
  );

  const withPresence = (r: RosterMember[]): TeamEntry[] =>
    r.map((p) => ({ ...p, connected: connectedIds.has(p.id) }));

  const assign = (id: string, side: "team1" | "team2") => {
    const member = pool.find((p) => p.id === id);
    if (!member) return;
    (side === "team1" ? setRoster1 : setRoster2)((prev) => [...prev, member]);
  };
  const unassign = (id: string) => {
    setRoster1((prev) => prev.filter((p) => p.id !== id));
    setRoster2((prev) => prev.filter((p) => p.id !== id));
  };

  const definition = (): MatchDefinition => ({
    id: name.trim(),
    // Assigned server-side; MatchZy needs an integer and the operator does not
    // need to know that.
    matchNumber: 0,
    team1: {
      name: team1,
      players: roster1.map((p) => ({ steamId: p.id, name: p.name })),
    },
    team2: {
      name: team2,
      players: roster2.map((p) => ({ steamId: p.id, name: p.name })),
    },
    maps,
    numMaps,
    playersPerTeam: Math.max(1, roster1.length, roster2.length),
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

  // The two-step this replaces — save, hunt for the row, load — was the whole
  // reason a setup took two screens and three clicks to start. Saving is still
  // what makes it re-runnable, so this does both rather than skipping it.
  const saveAndStart = useMutation({
    mutationFn: async () => {
      const def = definition();
      const { warnings } = await api.saveMatch(def);
      await api.loadMatch(def.id);
      return warnings;
    },
    meta: { action: "Starting the match" },
    onSuccess: (warnings) => {
      toast.success("Match loading", {
        description:
          "MatchZy is changing the map and starting warmup. Players ready up with .ready in chat.",
      });
      for (const w of warnings) toast.warning(w, { duration: 10000 });
      qc.invalidateQueries({ queryKey: ["matches"] });
      qc.invalidateQueries({ queryKey: ["match"] });
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
            flow — no veto, no ready-up, no backups. The manual controls below
            are what this server can do.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const startable = name.trim() !== "" && maps.length > 0;
  const vetoIsPointless =
    !skipVeto && maps.length === numMaps && maps.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Run a match</CardTitle>
        <CardDescription>
          MatchZy handles the veto, the knife round, ready-up and round backups.
          Starting a match changes the map and restarts the game for everyone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {templates.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Saved setups
            </Label>
            <ul className="divide-y border">
              {templates.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.id}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.definition.team1.name} vs {m.definition.team2.name} ·
                      BO{m.definition.numMaps} ·{" "}
                      {m.definition.maps.length} map
                      {m.definition.maps.length === 1 ? "" : "s"}
                      {m.definition.skipVeto ? "" : " · veto"}
                      {m.loadedAt ? " · loaded before" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => applyTemplate(m)}
                    >
                      Edit
                    </Button>
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

        <div className="space-y-1.5">
          <Label htmlFor="match-name">Setup name</Label>
          <Input
            id="match-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="friday-scrim"
            className="sm:max-w-xs"
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Teams
            </Label>
            <p className="text-xs text-muted-foreground">
              Arrows put a player on a team; click a name to take them off.
            </p>
          </div>
          {players.length === 0 && roster1.length + roster2.length === 0 ? (
            <p className="border border-dashed px-3 py-4 text-sm text-muted-foreground">
              Nobody is connected. Players have to be on the server to be put on
              a team — MatchZy identifies them by Steam ID. A saved setup keeps
              its roster, and MatchZy puts each player on their team as they
              join.
            </p>
          ) : (
            <TeamBuilder
              pool={pool}
              team1={withPresence(roster1)}
              team2={withPresence(roster2)}
              team1Name={team1}
              team2Name={team2}
              onTeam1Name={setTeam1}
              onTeam2Name={setTeam2}
              onAssign={assign}
              onRemove={unassign}
            />
          )}
          {ineligible > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Warning className="h-3.5 w-3.5" />
              {ineligible} bot{ineligible === 1 ? "" : "s"} hidden — bots have no
              Steam ID and cannot be on a match roster.
            </p>
          )}
        </div>

        <MapPoolPicker
          maps={allMaps}
          picked={maps}
          onChange={setMaps}
          skipVeto={skipVeto}
          onSkipVetoChange={setSkipVeto}
          numMaps={numMaps}
        />

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
          <div className="flex items-center justify-between gap-2 border px-3">
            <div className="py-2">
              <Label htmlFor="skip-veto">Skip the veto</Label>
              <p className="text-xs text-muted-foreground">
                Use the pool in order
              </p>
            </div>
            <Switch id="skip-veto" checked={skipVeto} onCheckedChange={setSkipVeto} />
          </div>
          <div className="flex items-center justify-between gap-2 border px-3">
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
        {vetoIsPointless && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Warning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {maps.length} map{maps.length === 1 ? "" : "s"} in a best-of-
            {numMaps} leaves nothing to veto, so MatchZy will skip it anyway.
            Add more maps to hold a veto.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <DangerConfirm
            title={`Start ${name.trim() || "this match"}?`}
            consequence="MatchZy changes the map and restarts the game. Anyone connected is put into warmup and has to ready up before it starts."
            operation="matchzy_loadmatch_url"
            confirmLabel="Start it"
            onConfirm={() => saveAndStart.mutate()}
          >
            {(arm) => (
              <Button
                onClick={arm}
                disabled={!startable || saveAndStart.isPending}
              >
                {saveAndStart.isPending ? (
                  <ArrowClockwise className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" weight="fill" />
                )}
                Save &amp; start
              </Button>
            )}
          </DangerConfirm>
          <Button
            variant="outline"
            onClick={() => save.mutate()}
            disabled={!startable || save.isPending}
          >
            {save.isPending ? (
              <ArrowClockwise className="h-4 w-4 animate-spin" />
            ) : null}
            Save for later
          </Button>
          <p className="text-xs text-muted-foreground">
            {startable
              ? "Saved setups are listed above and keep their roster."
              : "Needs a name and at least one map."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
