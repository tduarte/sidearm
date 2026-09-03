"use client";

/**
 * The match, at stadium scale, as the thing you change.
 *
 * This is the Broadcast direction landed on real data. The scoreboard is not a
 * readout with a link to a settings page — it *is* the settings page. The mode
 * you are playing, the map you are on and the round limit are all edited in
 * the band, in place, at the size they are worth.
 *
 * Two kinds of commitment live in the dock, and keeping them apart is the whole
 * design:
 *
 *  - **Staged.** Mode, map, round limit, overtime. Editing changes nothing;
 *    the dock names exactly what is pending and applies the lot in one cut.
 *    That model is not new — `lib/dashboard/panel.ts` already owned it, and
 *    this is a second rendering of it rather than a second implementation, so
 *    the rules it encodes (nothing is sent until you save, the map goes last)
 *    still hold here.
 *  - **Happens now.** Pause, knife, swap, demo, kick, end. These are mid-match
 *    interventions: someone is griefing or the map is stuck, and putting a
 *    save step in front of them would be the wrong kind of consistency. They
 *    fire on confirm.
 *
 * Staged edits come in two tiers, because the server takes them two ways:
 *
 *  - **cvars and the server config**, written over RCON one at a time.
 *    `lib/dashboard/panel.ts` owns that diff.
 *  - **a MatchZy match config** — team names, rosters, captains, series length,
 *    veto and clinch — saved and loaded whole. `lib/dashboard/match-draft.ts`
 *    owns that one.
 *
 * They share the dock and the Apply button because from the operator's side
 * there is one question, "what have I changed", and one answer. Underneath,
 * the order is not arbitrary: cvars and config first, then the match config,
 * then the map. The map goes last because loading one takes a minute and there
 * is no reason to make every other change wait behind it.
 *
 * The second tier needs MatchZy. Vanilla CS2 has no idea what a named team is,
 * so when the plugin is absent the team fields, captain badges and series
 * controls are **not drawn at all** — with the reason said once, near the
 * scoreboard — rather than drawn and dead.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowCounterClockwise,
  CaretDown,
  DotsThree,
  FlagCheckered,
  Pause,
  PencilSimple,
  Play,
  Knife,
  ArrowsLeftRight,
  Record,
  Stop,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import { useCan } from "@/components/session-provider";
import { api } from "@/lib/api/client";
import { formatDuration, type BanDuration } from "@/lib/cs2/bans";
import { useLivePlayers } from "@/lib/hooks/use-live-players";
import { formatElapsed, usePendingOp } from "@/lib/hooks/use-pending-op";
import { getOfficialMapArtPath } from "@/lib/maps/official-art";
import {
  changedKeys,
  fieldLabel,
  fieldsForMode,
  modeNeedsMapReload,
  planApply,
  presetActive,
  presetDraft,
  type ApplyStep,
  type Draft,
  type FieldKey,
  type PanelValues,
} from "@/lib/dashboard/panel";
import {
  buildDefinition,
  currentSetup,
  pickTurn,
  resolveSetup,
  setupChanges,
  setupId,
  setupProblems,
  withCaptain,
  type SetupChangeKey,
  type SetupDraft,
  type SetupSide,
} from "@/lib/dashboard/match-draft";
import { PracticeStrip } from "@/components/broadcast/practice-strip";
import { ACTIVE_DUTY_AS_OF, activeDutyPool, RESERVE } from "@/lib/cs2/map-pools";
import { PRESETS } from "@/lib/presets";
import type { RoundBackup } from "@/lib/cs2/round-backups";
import type { MapEntry, MatchState, Player, ServerStatus } from "@/lib/api/types";

/* ---------------- shape ---------------- */

/**
 * Deathmatch has no sides, so a two-column scoreboard with a CT and a T score
 * would be two halves of a lie. Everything else the panel offers is played
 * CT against T, including practice.
 */
function isSided(mode: string): boolean {
  return mode !== "deathmatch";
}

/** `null` means Docker is unreachable — never "0h 0m", which reads as a crash loop. */
function uptime(sec: number | null): string {
  if (sec === null) return "unknown";
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

type NowAction = {
  id: string;
  label: string;
  hint: string;
  rcon: string;
  Icon: typeof Pause;
  /** What pressing it actually does, and what it costs. */
  consequence: (ctx: { players: number; map: string; score: string }) => string;
};

type Sheet =
  | { kind: "pool" }
  | { kind: "series" }
  | { kind: "lineups" }
  | { kind: "backups" }
  | { kind: "apply" }
  | { kind: "more" }
  | { kind: "now"; action: NowAction }
  | { kind: "kick"; player: Player }
  | { kind: "ban"; player: Player }
  | { kind: "end" };

/** Series lengths MatchZy accepts. Not a free number: `numMaps` is 1, 3 or 5. */
const SERIES_LENGTHS = [1, 3, 5];

/**
 * How the staged match config is put back when its chip is dismissed.
 *
 * One chip can stand for several draft fields — "Roster" is every side move at
 * once — so dropping it has to clear all of them, or the chip disappears and
 * the change stays.
 */
function dropSetupKey(draft: SetupDraft, key: SetupChangeKey): SetupDraft {
  const next = { ...draft };
  if (key === "roster") delete next.sides;
  else if (key === "captains") delete next.captains;
  else delete next[key];
  return next;
}

/**
 * Offered ban lengths. `null` — no expiry — is a real option rather than the
 * absence of one, and it is the only length CS2 itself honours: see
 * `lib/cs2/bans.ts` for why the panel, not the game server, owns the clock.
 */
const BAN_DURATIONS: BanDuration[] = [15, 60, 60 * 24, 60 * 24 * 7, null];

/* ---------------- rows ---------------- */

function Stats({ p }: { p: Player }) {
  const kd = (p.k / Math.max(1, p.d)).toFixed(2);
  return (
    <span className="bc__stats">
      <span className="bc__num" data-l="K">
        {p.k}
      </span>
      <span className="bc__num bc__num--dim" data-l="D">
        {p.d}
      </span>
      <span className="bc__num bc__num--dim" data-l="A">
        {p.a}
      </span>
      <span className="bc__num" data-l="K/D">
        {kd}
      </span>
      <span className="bc__num bc__num--dim" data-l="PING">
        {p.ping}
      </span>
    </span>
  );
}

/**
 * `nameRight` moves the name block to the end of the row. It is the only
 * difference between the two halves of the board: same markup, same order,
 * opposite edge. CT takes it, because CT's row ends at the centre.
 */
function Head({
  name,
  count,
  nameRight,
}: {
  name: string;
  count: number;
  nameRight?: boolean;
}) {
  return (
    <div className={`bc__head bc__head--${nameRight ? "r" : "l"}`}>
      <span className="bc__headName">
        {name} · {count}
      </span>
      <span className="bc__stats">
        <span>K</span>
        <span>D</span>
        <span>A</span>
        <span>K/D</span>
        <span>Ping</span>
      </span>
    </div>
  );
}

/**
 * The parts of a row that only exist when a match config can be staged.
 *
 * Absent, not disabled: without MatchZy there is nothing to write a captain or
 * a side move to, and a greyed button that would never be pressable is worse
 * than no button.
 */
type RowSetup = {
  isCaptain: boolean;
  /** Staged this session, as opposed to already true on the server. */
  captainStaged: boolean;
  /** This player is somewhere the server has not put them yet. */
  moved: boolean;
  /** What the cross-move button says, e.g. `T \u25b8`. */
  crossLabel: string;
  crossTitle: string;
  onCaptain: () => void;
  onBench: () => void;
  onCross: () => void;
};

function Row({
  p,
  /** Longest bar on the board, so the meter is relative to the night's top fragger. */
  topKills,
  rank,
  canKick,
  onKick,
  nameRight,
  setup,
}: {
  p: Player;
  topKills: number;
  rank?: number;
  canKick: boolean;
  onKick: (p: Player) => void;
  nameRight?: boolean;
  setup?: RowSetup;
}) {
  return (
    <div
      className={`bc__row bc__row--${nameRight ? "r" : "l"}${setup?.moved ? " bc__row--moved" : ""}`}
    >
      {/*
        There is no ADR in `status` — CS2 does not report it over RCON — so the
        meter is kills against the top fragger rather than a damage number the
        panel would have to invent.
      */}
      <span
        className="bc__bar"
        style={{ width: `${topKills ? Math.min(100, (p.k / topKills) * 100) : 0}%` }}
        aria-hidden
      />
      <span className="bc__who">
        {rank !== undefined && <span className="bc__rank">{rank}</span>}
        <span className="bc__player">{p.name}</span>
        {setup && (
          /*
            The C is a drafting device, and the tooltip says so. MatchZy has no
            captain field: what survives into the config is list position, so
            this marks who goes first on their side and nothing more.
          */
          <button
            type="button"
            className={`bc__cap${setup.isCaptain ? " bc__cap--on" : ""}${setup.captainStaged ? " bc__cap--staged" : ""}`}
            aria-pressed={setup.isCaptain}
            aria-label={
              setup.isCaptain
                ? `${p.name} leads this side — remove`
                : `Make ${p.name} lead this side`
            }
            title={
              setup.isCaptain
                ? "Listed first in the roster. MatchZy has no captain of its own."
                : `Make ${p.name} lead this side`
            }
            onClick={setup.onCaptain}
          >
            C
          </button>
        )}
      </span>
      <Stats p={p} />
      <span className="bc__moves">
        {setup && (
          <>
            <button
              className="bc__move"
              type="button"
              onClick={setup.onBench}
              title={`Bench ${p.name}`}
            >
              Bench
            </button>
            <button
              className="bc__move"
              type="button"
              onClick={setup.onCross}
              title={setup.crossTitle}
            >
              {setup.crossLabel}
            </button>
          </>
        )}
        {canKick && (
          <button
            className="bc__move bc__move--now"
            type="button"
            onClick={() => onKick(p)}
          >
            Kick
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * One half of the band.
 *
 * The name is an input when a match config can be staged and plain text when
 * it cannot, because renaming a side *is* loading a config — there is no cvar
 * for it. A field that silently did nothing on a plugin-less server would be
 * the worst of the three options.
 *
 * The captain line sits in the tag rather than beside the badge on the row: it
 * is the answer to "who is leading this side", which is a question about the
 * team, not about a player.
 */
function Side({
  side,
  count,
  score,
  name,
  captain,
  edit,
}: {
  side: "ct" | "t";
  count: number;
  score: number;
  name: string;
  /** `undefined` when captains are not a concept here (no MatchZy). */
  captain?: string | null;
  edit?: { staged: boolean; onChange: (value: string) => void };
}) {
  const label = side === "ct" ? "Counter-Terrorists" : "Terrorists";
  return (
    <div className={`bc__side${side === "t" ? " bc__side--t bc__t" : " bc__ct"}`}>
      <span className="bc__sideMark" aria-hidden />
      <span className="bc__team">
        <span className="bc__tag">
          {label} · {count}
          {captain !== undefined &&
            (captain ? (
              <span className="bc__capName"> · c {captain}</span>
            ) : (
              <span className="bc__tagWarn"> · no captain</span>
            ))}
        </span>
        {edit ? (
          <span className="bc__nameWrap">
            <input
              className={`bc__nameField${edit.staged ? " bc__nameField--staged" : ""}${name.trim() ? "" : " bc__nameField--bad"}`}
              value={name}
              maxLength={24}
              onChange={(e) => edit.onChange(e.target.value)}
              // Trimmed on the way out, not on every keystroke: trimming as you
              // type makes the space bar appear broken between two words.
              onBlur={(e) => edit.onChange(e.target.value.trim())}
              aria-label={`${label} team name`}
              spellCheck={false}
            />
            <span className="bc__pencil" aria-hidden>
              <PencilSimple size={14} />
            </span>
          </span>
        ) : (
          <span className="bc__nameRead">{name}</span>
        )}
      </span>
      <span className="bc__score">{score}</span>
    </div>
  );
}

/* ---------------- the stage ---------------- */

export function MatchStage({
  status,
  match,
}: {
  status: ServerStatus;
  match: MatchState | undefined;
}) {
  const canEdit = useCan("admin");
  const canModerate = useCan("moderator");
  const qc = useQueryClient();

  const [draft, setDraft] = useState<Draft>({});
  /**
   * The second tier, kept separate from `draft` because it is applied
   * differently: `draft` becomes a list of RCON writes, this becomes one saved
   * config and one load.
   */
  const [setupDraft, setSetupDraft] = useState<SetupDraft>({});
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [banMinutes, setBanMinutes] = useState<BanDuration>(60);
  const [banReason, setBanReason] = useState("");

  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => api.getConfig(),
    // Admin-only route. Asking as a moderator produces a 403 and a toast about
    // a request nobody made.
    enabled: canEdit,
  });
  const maps = useQuery({ queryKey: ["maps"], queryFn: () => api.getMaps() });
  const { data: players } = useLivePlayers();
  /**
   * A map change is acknowledged by RCON in milliseconds and finishes about a
   * minute later, while the server downloads and loads the level. The apply
   * pill ends at the acknowledgement, so without this the dock goes quiet at
   * exactly the point someone starts wondering whether it worked. The Maps page
   * carried this clock; it belongs wherever Play survives, and Play is here now.
   */
  const { op: pendingOp, elapsedSec } = usePendingOp();

  const roster = useMemo(() => players ?? [], [players]);
  const topKills = Math.max(0, ...roster.map((p) => p.k));

  /**
   * MatchZy's round backups, read only while the sheet that shows them is
   * open. They are a file listing on the server and nobody needs them on a
   * quiet dashboard.
   */
  const backups = useQuery<RoundBackup[]>({
    queryKey: ["round-backups"],
    queryFn: () => api.getRoundBackups(),
    enabled: sheet?.kind === "backups",
  });

  /**
   * What the server says right now — derived every render, never copied into
   * state. Someone else's change, or MatchZy's at the half, has to show up
   * here; a stale local copy would be written back over theirs on the next
   * apply.
   */
  const current: PanelValues | null = useMemo(() => {
    if (!config.data) return null;
    return {
      hostname: status.hostname,
      map: status.map,
      mode: status.gameMode,
      serverPassword: config.data.access.serverPassword,
      botsEnabled: config.data.gameplay.botsEnabled,
      botQuota: config.data.gameplay.botQuota,
      botDifficulty: config.data.gameplay.botDifficulty,
      visibleMaxPlayers: config.data.gameplay.visibleMaxPlayers,
      maxRounds: match?.maxRounds ?? null,
      overtime: match?.overtime ?? null,
    };
  }, [config.data, status, match]);

  /**
   * The map is the one staged edit that is not admin-only: `/api/maps/current`
   * is a moderator route, while `/api/config` — which `current` is assembled
   * from — is admin. Deriving the map's staging through `current` therefore
   * took the map down with it, and a moderator got a permanently disabled map
   * button on the page whose own header says the map is edited here.
   *
   * So the map diffs against `status`, which every role can read, and only the
   * config-shaped fields go through `current`.
   */
  const stagedMap =
    draft.map !== undefined && draft.map !== status.map ? draft.map : null;

  const dirty: FieldKey[] = current
    ? changedKeys(current, draft)
    : stagedMap
      ? ["map"]
      : [];
  const steps: ApplyStep[] =
    current && config.data
      ? planApply(current, draft, config.data)
      : stagedMap
        ? [{ kind: "map", name: stagedMap, label: `Map → ${stagedMap}` }]
        : [];
  const needsReload = current ? modeNeedsMapReload(current, draft) : false;

  /**
   * While a MatchZy config is loaded the plugin owns the mode numbers, the
   * round limit and overtime — it re-execs `live.cfg` and would revert
   * anything written here. The server already refuses those writes; saying so
   * up front is better than offering a control that silently loses.
   */
  const matchzyOwns = Boolean(match?.matchzyState);

  const apply = useMutation({
    mutationFn: async () => {
      // Sequential on purpose: the order `planApply` returns is the point, and
      // a parallel burst of RCON writes is the half-applied state this staging
      // model exists to prevent.
      //
      // Three phases, in this order. Cvars and config first, because they are
      // cheap and a mode change wants to be in place before anything reads it.
      // The match config next, since loading one restarts the match and would
      // otherwise wipe writes made after it. The map last, because it takes a
      // minute and nothing should wait behind it.
      for (const step of steps) {
        if (step.kind === "cvar") await api.setCvar(step.name, step.value);
        else if (step.kind === "config") await api.putConfig(step.config);
      }

      if (setupChips.length > 0) {
        const definition = buildDefinition(setup, {
          id: setupId(setup),
          order,
          nameOf,
          wingman: mode === "wingman",
        });
        const { warnings } = await api.saveMatch(definition);
        await api.loadMatch(definition.id);
        // Separate toasts, and long ones: a warning means something the
        // operator asked for will not happen, and it is the only chance to say
        // so before the match is already running.
        for (const w of warnings) toast.warning(w, { duration: 10_000 });
      }

      const mapStep = steps.find((step) => step.kind === "map");
      if (mapStep) await api.changeMap(mapStep.name);
    },
    meta: { action: "Apply" },
    onSuccess: () => {
      const changedMap = steps.some((s) => s.kind === "map");
      const count = steps.length + setupChips.length;
      toast.success(`Applied ${count} change${count === 1 ? "" : "s"}`, {
        description: changedMap
          ? "A map the server has not cached downloads first — allow about a minute."
          : undefined,
      });
      setDraft({});
      setSetupDraft({});
      setSheet(null);
      qc.invalidateQueries({ queryKey: ["status"] });
      qc.invalidateQueries({ queryKey: ["config"] });
      qc.invalidateQueries({ queryKey: ["match"] });
      qc.invalidateQueries({ queryKey: ["matches"] });
      qc.invalidateQueries({ queryKey: ["players"] });
    },
  });

  /**
   * The saved setups, which are also the thing every apply writes: loading a
   * config saves it first, so last Friday's teams are still there next Friday
   * without anyone having pressed Save.
   */
  const saved = useQuery({
    queryKey: ["matches"],
    queryFn: () => api.getMatchConfigs(),
    enabled: canModerate && sheet?.kind === "lineups",
  });

  const restore = useMutation({
    mutationFn: (round: number) => api.restoreRound(round),
    meta: { action: "Restoring the round" },
    onSuccess: (_r, round) => {
      setSheet(null);
      setSaid(`Restoring round ${round}.`);
      setTimeout(() => setSaid(null), 3200);
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const phase = useMutation({
    mutationFn: (next: MatchState["phase"]) => api.setMatchPhase(next),
    meta: { action: "Match phase" },
    onSuccess: () => {
      setSheet(null);
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const now = useMutation({
    mutationFn: async (action: NowAction) => {
      switch (action.id) {
        case "pause":
          return void (await api.setPause(
            match?.pause === "paused" ? "unpause" : "pause",
          ));
        case "knife":
          return void (await api.knife(
            match?.knifeSetupApplied ? "restore" : "setup",
          ));
        case "swap":
          return void (await api.swapTeams());
        case "demo":
          return void (await api.setDemo(
            match?.demo.state === "recording" ? "stop" : "start",
          ));
        case "start":
          return void (await api.forceStartMatch());
      }
    },
    meta: { action: "Match control" },
    onSuccess: (_r, action) => {
      setSheet(null);
      setSaid(`${action.label} sent.`);
      setTimeout(() => setSaid(null), 3200);
      qc.invalidateQueries({ queryKey: ["match"] });
      qc.invalidateQueries({ queryKey: ["players"] });
    },
  });

  const kick = useMutation({
    mutationFn: (p: Player) => api.kick(p.steamId),
    meta: { action: "Kick" },
    onSuccess: (_r, p) => {
      setSheet(null);
      setSaid(`${p.name} was kicked.`);
      setTimeout(() => setSaid(null), 3200);
      qc.invalidateQueries({ queryKey: ["players"] });
      qc.invalidateQueries({ queryKey: ["status"] });
    },
  });

  /**
   * The ban route, its dialog and its list have all existed since the roster
   * page did; nothing imported any of them, so the panel could kick and could
   * not ban. This is the moderator's other answer to the same person, and it
   * belongs one button away from the first.
   */
  const ban = useMutation({
    mutationFn: (p: Player) => api.banPlayer(p.steamId, banMinutes, banReason || undefined),
    meta: { action: "Ban" },
    onSuccess: (_r, p) => {
      setSheet(null);
      setSaid(`${p.name} was banned — ${formatDuration(banMinutes)}.`);
      setTimeout(() => setSaid(null), 3200);
      qc.invalidateQueries({ queryKey: ["players"] });
      qc.invalidateQueries({ queryKey: ["status"] });
      qc.invalidateQueries({ queryKey: ["bans"] });
    },
  });

  const endMatch = useMutation({
    mutationFn: () => api.endMatch(),
    meta: { action: "End match" },
    onSuccess: () => {
      setSheet(null);
      setSaid("Match ended.");
      setTimeout(() => setSaid(null), 3200);
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  /* ---------------- derived copy ---------------- */

  const mapList: MapEntry[] = maps.data?.all ?? [];
  const label = (name: string) =>
    mapList.find((m) => m.name === name)?.displayName ?? name;

  const mode = draft.mode ?? status.gameMode;
  const sided = isSided(mode);
  const shown = new Set<FieldKey>(fieldsForMode(mode));
  const paused = match?.pause === "paused";

  /* ---------------- the match-config tier ---------------- */

  /**
   * Everything below this line needs MatchZy. `status.plugins.matchzy` is
   * three-valued — `null` is "not probed yet", and the whole object is null
   * before the first probe lands — so only a definite `true` earns the
   * controls. Drawing them on a maybe means drawing them on a server that will
   * refuse them.
   */
  const matchzy = status.plugins?.matchzy === true;
  const canSetup = canModerate && matchzy && sided;

  const setupCurrent = useMemo(
    () => currentSetup(match, roster, status.map),
    [match, roster, status.map],
  );
  const order = roster.map((p) => p.steamId);
  const nameOf = (id: string) =>
    roster.find((p) => p.steamId === id)?.name ?? id;
  const setup = resolveSetup(setupCurrent, setupDraft);
  const setupChips = canSetup
    ? setupChanges(setupCurrent, setupDraft, nameOf, label)
    : [];
  const setupIssues = setupChips.length ? setupProblems(setup, order) : [];
  const turn = pickTurn(setup, order);

  /**
   * Which team is on which side, right now.
   *
   * Team 1 starts on CT and swaps at the half. Binding a name to a column
   * instead of to `side` is how a scoreboard ends up confidently wrong for a
   * whole half, so every name, every count and every staged move is routed
   * through here.
   */
  const team1IsCt = match?.series?.team1.side !== "T";
  const teamOn = (column: "ct" | "t") =>
    ((column === "ct") === team1IsCt ? "team1" : "team2") as "team1" | "team2";
  const columnOf = (steamId: string): "ct" | "t" | "bench" => {
    const side = setup.sides[steamId] ?? "bench";
    if (side === "bench") return "bench";
    return (side === "team1") === team1IsCt ? "ct" : "t";
  };

  const ct = roster.filter((p) => columnOf(p.steamId) === "ct");
  const t = roster.filter((p) => columnOf(p.steamId) === "t");
  const spec = roster.filter((p) => columnOf(p.steamId) === "bench");

  const nameFor = (column: "ct" | "t") =>
    teamOn(column) === "team1" ? setup.team1Name : setup.team2Name;
  const captainFor = (column: "ct" | "t") => {
    const id = setup.captains[teamOn(column)];
    return id ? nameOf(id) : null;
  };

  const stageSide = (steamId: string, side: SetupSide) =>
    setSetupDraft((d) => ({ ...d, sides: { ...d.sides, [steamId]: side } }));

  const stageCaptain = (steamId: string, column: "ct" | "t") => {
    const team = teamOn(column);
    setSetupDraft((d) =>
      withCaptain(
        d,
        team,
        resolveSetup(setupCurrent, d).captains[team] === steamId ? null : steamId,
      ),
    );
  };

  const rowSetup = (p: Player, column: "ct" | "t"): RowSetup | undefined => {
    if (!canSetup) return undefined;
    const team = teamOn(column);
    const other: "ct" | "t" = column === "ct" ? "t" : "ct";
    return {
      isCaptain: setup.captains[team] === p.steamId,
      captainStaged:
        setup.captains[team] === p.steamId &&
        setupCurrent.captains[team] !== p.steamId,
      moved: setup.sides[p.steamId] !== setupCurrent.sides[p.steamId],
      crossLabel: column === "ct" ? "T \u25b8" : "\u25c2 CT",
      crossTitle: `Move ${p.name} to ${nameFor(other) || (other === "ct" ? "Counter-Terrorists" : "Terrorists")}`,
      onCaptain: () => stageCaptain(p.steamId, column),
      onBench: () => stageSide(p.steamId, "bench"),
      onCross: () => stageSide(p.steamId, teamOn(other)),
    };
  };

  /**
   * MatchZy holds a loaded match at the ready-up until every roster slot has
   * typed `.ready`, which on a Friday is the one thing nobody does. Offered
   * only in the states where it is the answer — in `live` it does nothing, and
   * an always-present button that sometimes does nothing teaches people to
   * distrust the row.
   */
  const canForceStart =
    matchzy &&
    (match?.matchzyState === "warmup" ||
      match?.matchzyState === "waiting_for_players");

  const NOW_ACTIONS: NowAction[] = [
    ...(canForceStart
      ? [
          {
            id: "start",
            label: "Force start",
            hint: "skip the ready-ups",
            rcon: ".forcestart",
            Icon: FlagCheckered,
            consequence: (c: { players: number; map: string; score: string }) =>
              `Starts the loaded match on ${c.map} without waiting for the remaining ready-ups. All ${c.players} connected stay where they are.`,
          } satisfies NowAction,
        ]
      : []),
    {
      id: "pause",
      label: paused ? "Resume" : "Pause",
      hint: paused ? "back live at the next round" : "freeze at the next round",
      rcon: paused ? "mp_unpause_match" : "mp_pause_match",
      Icon: paused ? Play : Pause,
      consequence: (c) =>
        paused
          ? `Puts the match back live at the next round break. All ${c.players} stay connected.`
          : `Freezes the match at the next round break — not immediately; CS2 applies it at the end of the round. All ${c.players} stay connected.`,
    },
    {
      id: "knife",
      label: match?.knifeSetupApplied ? "End knife" : "Knife round",
      hint: match?.knifeSetupApplied
        ? "restore the settings from before"
        : "set up and restart the round",
      rcon: match?.knifeSetupApplied ? "knife restore" : "knife setup",
      Icon: Knife,
      consequence: (c) =>
        match?.knifeSetupApplied
          ? "Puts back the cvars the knife round overwrote, from the baseline the panel took before it."
          : `Restarts ${c.map} for a knife round. The score — ${c.score} — is lost.`,
    },
    {
      id: "swap",
      label: "Swap sides",
      hint: "halftime, by hand",
      rcon: "mp_swapteams",
      Icon: ArrowsLeftRight,
      consequence: () =>
        "Moves everyone to the other side immediately, mid-round. The scores swap with them.",
    },
    {
      id: "demo",
      label: match?.demo.state === "recording" ? "Stop demo" : "Record demo",
      hint:
        match?.demo.state === "recording"
          ? "close the file GOTV is writing"
          : "start recording through GOTV",
      rcon: match?.demo.state === "recording" ? "tv_stoprecord" : "tv_record",
      Icon: Record,
      consequence: () =>
        match?.demo.state === "recording"
          ? "Closes the demo GOTV is writing. It appears under History once the file is flushed."
          : "Starts recording through GOTV. Nothing else about the match changes.",
    },
  ];

  const nowCtx = {
    players: roster.length,
    map: label(status.map),
    score: match ? `${match.score.ct}-${match.score.t}` : "0-0",
  };

  /**
   * The staged diff in the dock's words, derived from the two objects rather
   * than from a dirty flag per control, so it cannot claim a change that is
   * not there or miss one that is.
   */
  const chips = dirty.map((key) => {
    const value = draft[key];
    const to =
      key === "overtime"
        ? value
          ? "on"
          : "off"
        : key === "map"
          ? label(String(value))
          : key === "mode"
            ? (PRESETS.find((p) => p.live.mode === value)?.label ?? String(value))
            : String(value);
    return {
      key,
      label: fieldLabel(key),
      to,
      note:
        key === "map"
          ? "reloads the level — about a minute"
          : key === "mode" && needsReload
            ? "takes effect on the next map load"
            : undefined,
      onDismiss: () =>
        setDraft((d) => {
          const next = { ...d };
          delete next[key];
          return next;
        }),
    };
  });

  /**
   * One dock, two tiers. The chips are tagged by where they came from only so
   * their keys cannot collide — the operator is looking at one list of pending
   * changes, which is the whole reason both tiers share an Apply.
   */
  const allChips = [
    ...chips,
    ...setupChips.map((c) => ({
      key: `setup:${c.key}`,
      label: c.label,
      to: c.to,
      note: c.note,
      onDismiss: () => setSetupDraft((d) => dropSetupKey(d, c.key)),
    })),
  ];

  const heavy = chips.some((c) => c.key === "map");
  const blocked = setupIssues.length > 0;

  /* ---------------- render ---------------- */


  return (
    <>
      <div className={`bc__band${sided ? "" : " bc__band--solo"}`}>
        {sided && (
          <Side
            side="ct"
            count={ct.length}
            score={match?.score.ct ?? 0}
            name={nameFor("ct")}
            captain={canSetup ? captainFor("ct") : undefined}
            edit={
              canSetup
                ? {
                    staged: setup[`${teamOn("ct")}Name`] !== setupCurrent[`${teamOn("ct")}Name`],
                    onChange: (value) =>
                      setSetupDraft((d) => ({ ...d, [`${teamOn("ct")}Name`]: value })),
                  }
                : undefined
            }
          />
        )}

        <div className="bc__centre">
          <span
            className={`bc__live${status.state === "unknown" ? " bc__live--unknown" : ""}`}
          >
            {status.state !== "unknown" && <span className="bc__dot" aria-hidden />}
            {status.state === "unknown"
              ? "Condition unknown"
              : match
                ? match.phase === "live"
                  ? paused
                    ? "Live · paused"
                    : allChips.length
                      ? "Live · staged"
                      : "Live"
                  : match.phase === "warmup"
                    ? "Warmup"
                    : match.phase === "ended"
                      ? "Ended"
                      : "No match"
                : "No match"}
          </span>

          {/*
            Mode decides what the rest of this column even means — whether
            there are sides at all, whether a round limit exists, whether
            overtime is a thing. Only the mode you are on is on screen; the
            others are one click away, each stating the shape it puts the
            server in.
          */}
          {canEdit && !matchzyOwns ? (
            <details
              className="bc__mode"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  e.currentTarget.open = false;
                }
              }}
            >
              <summary
                className={`bc__modeBtn${dirty.includes("mode") ? " bc__modeBtn--staged" : ""}`}
              >
                <span className="bc__modeName">
                  {PRESETS.find((p) => p.live.mode === mode)?.label ?? mode}
                </span>
                <span className="bc__modeShape">
                  {PRESETS.find((p) => p.live.mode === mode)?.shape}
                </span>
                <span aria-hidden>
                  <CaretDown size={12} weight="bold" />
                </span>
              </summary>
              <div className="bc__modeMenu" role="group" aria-label="Game mode">
                {PRESETS.map((preset) => {
                  const on = current ? presetActive(preset, current) : false;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={on}
                      className={`bc__modeOpt${on ? " bc__modeOpt--on" : ""}`}
                      onClick={(e) => {
                        if (current) {
                          setDraft((d) => ({ ...d, ...presetDraft(preset, current) }));
                        }
                        e.currentTarget.closest("details")?.removeAttribute("open");
                      }}
                    >
                      <span className="bc__modeOptName">{preset.label}</span>
                      <span className="bc__modeOptShape">{preset.tagline}</span>
                    </button>
                  );
                })}
              </div>
            </details>
          ) : (
            <span className="bc__modeBtn" aria-disabled>
              <span className="bc__modeName">
                {PRESETS.find((p) => p.live.mode === mode)?.label ?? mode}
              </span>
              <span className="bc__modeShape">
                {matchzyOwns ? "MatchZy is running this" : undefined}
              </span>
            </span>
          )}

          <button
            type="button"
            className={`bc__mapBtn${stagedMap ? " bc__mapBtn--staged" : ""}`}
            onClick={() => setSheet({ kind: "pool" })}
            disabled={!canModerate || maps.isPending}
            title="Change the map"
          >
            {label(status.map)}
            {canModerate && (
              <span className="bc__caret" aria-hidden>
                <CaretDown size={14} weight="bold" />
              </span>
            )}
          </button>

          {stagedMap && (
            <span className="bc__cue">
              <span
                className="bc__cueArt"
                style={{
                  backgroundImage: `url(${getOfficialMapArtPath(stagedMap) ?? ""})`,
                }}
                aria-hidden
              />
              Cued · {label(stagedMap)}
              <button
                className="bc__cueX"
                type="button"
                onClick={() =>
                  setDraft((d) => {
                    const next = { ...d };
                    delete next.map;
                    return next;
                  })
                }
                aria-label="Drop the cued map"
              >
                <X size={11} weight="bold" />
              </button>
            </span>
          )}

          <span className="bc__round">
            {match && sided
              ? match.maxRounds === null
                ? `Round ${match.round}`
                : `Round ${match.round} of ${match.maxRounds}`
              : `${roster.length} connected`}
          </span>

          {/*
            The round limit, where the line above states it. `fieldsForMode`
            already says this is competitive-only — a limit on a deathmatch
            server is a number that governs nothing — and it was consulted for
            overtime and nothing else, so the header's claim that the round
            limit is edited in the band was true of the plan and not of the
            page.

            It stages like everything else here; `planApply` has always known
            how to emit `mp_maxrounds`.
          */}
          {shown.has("maxRounds") &&
            canEdit &&
            !matchzyOwns &&
            current?.maxRounds != null && (
              <span
                className={`bc__limit${dirty.includes("maxRounds") ? " bc__limit--staged" : ""}`}
              >
                <label className="bc__limitLabel" htmlFor="bc-maxrounds">
                  Rounds
                </label>
                <input
                  id="bc-maxrounds"
                  className="bc__limitInput"
                  type="number"
                  min={1}
                  max={120}
                  step={1}
                  value={draft.maxRounds ?? current.maxRounds}
                  onChange={(e) => {
                    // Rejected rather than clamped: clamping a half-typed "3"
                    // on the way to "30" fights the person typing it.
                    const n = Number(e.target.value);
                    if (!Number.isInteger(n) || n < 1 || n > 120) return;
                    setDraft((d) => ({ ...d, maxRounds: n }));
                  }}
                />
                {/*
                  `mp_maxrounds` is the rounds played, not the rounds needed —
                  24 is "first to 13" — and that arithmetic is the whole reason
                  anyone opens this control.
                */}
                <span className="bc__limitHint">
                  first to{" "}
                  {Math.floor((draft.maxRounds ?? current.maxRounds) / 2) + 1}
                </span>
              </span>
            )}

          {/*
            The series. `numMaps` is not a cvar and never was — it is a field
            of the match config — so this stages into the other draft and rides
            the same Apply. The pips above it are the series MatchZy is
            actually running, which is why they can disagree with the segments
            while something is staged: one is the programme, the other is the
            proposal.
          */}
          {match?.series && match.series.maps.length > 1 && (
            <span
              className="bc__pips"
              aria-label={`Series score ${match.series.team1.seriesScore}-${match.series.team2.seriesScore}, map ${match.series.mapNumber + 1} of ${match.series.maps.length}`}
            >
              {match.series.maps.map((m, i) => {
                const decided =
                  match.series!.team1.seriesScore + match.series!.team2.seriesScore;
                const state =
                  i < match.series!.team1.seriesScore
                    ? team1IsCt
                      ? "ct"
                      : "t"
                    : i < decided
                      ? team1IsCt
                        ? "t"
                        : "ct"
                      : i === match.series!.mapNumber
                        ? "now"
                        : "";
                return (
                  <span
                    key={`${m}-${i}`}
                    className={`bc__pip${state ? ` bc__pip--${state}` : ""}`}
                  />
                );
              })}
            </span>
          )}

          {canSetup && (
            <div className="bc__seg" role="group" aria-label="Series length">
              {SERIES_LENGTHS.map((n) => {
                const on = setup.numMaps === n;
                const staged = on && n !== setupCurrent.numMaps;
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    className={`bc__segBtn${on ? (staged ? " bc__segBtn--staged" : " bc__segBtn--on") : ""}`}
                    onClick={() =>
                      setSetupDraft((d) => ({ ...d, numMaps: n }))
                    }
                  >
                    Bo{n}
                  </button>
                );
              })}
              <button
                type="button"
                className="bc__segBtn"
                onClick={() => setSheet({ kind: "series" })}
              >
                Maps…
              </button>
            </div>
          )}

          {shown.has("overtime") && canEdit && !matchzyOwns && current?.overtime !== null && (
            <button
              type="button"
              role="switch"
              aria-checked={draft.overtime ?? current?.overtime ?? false}
              className={`bc__switch${draft.overtime ?? current?.overtime ? " bc__switch--on" : ""}${dirty.includes("overtime") ? " bc__switch--staged" : ""}`}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  overtime: !(d.overtime ?? current?.overtime ?? false),
                }))
              }
            >
              <span className="bc__track" aria-hidden>
                <span className="bc__knob" />
              </span>
              Overtime
            </button>
          )}
        </div>

        {sided && (
          <Side
            side="t"
            count={t.length}
            score={match?.score.t ?? 0}
            name={nameFor("t")}
            captain={canSetup ? captainFor("t") : undefined}
            edit={
              canSetup
                ? {
                    staged: setup[`${teamOn("t")}Name`] !== setupCurrent[`${teamOn("t")}Name`],
                    onChange: (value) =>
                      setSetupDraft((d) => ({ ...d, [`${teamOn("t")}Name`]: value })),
                  }
                : undefined
            }
          />
        )}
      </div>

      {/*
        The rundown is the series the server is running, not the one being
        staged: a cued map marks its tile rather than rewriting the strip, so
        the thing on air stays readable while you plan the change.
      */}
      {match?.series && match.series.maps.length > 1 && (
        <div className="bc__rundown">
          <span className="bc__rdLabel">
            Rundown · Bo{match.series.maps.length}
          </span>
          <div className="bc__rdMaps">
            {match.series.maps.map((m, i) => {
              const state =
                i === match.series!.mapNumber
                  ? "live"
                  : i < match.series!.mapNumber
                    ? "done"
                    : i === match.series!.mapNumber + 1
                      ? "next"
                      : "";
              const cued = m === stagedMap;
              const art = getOfficialMapArtPath(m);
              return (
                <div
                  key={`${m}-${i}`}
                  className={`bc__rd${state ? ` bc__rd--${state}` : ""}${cued ? " bc__rd--cued" : ""}`}
                >
                  {art && (
                    <span
                      className="bc__rdArt"
                      style={{ backgroundImage: `url(${art})` }}
                      aria-hidden
                    />
                  )}
                  <span className="bc__rdName">{label(m)}</span>
                  <span className="bc__rdNote">
                    {cued
                      ? "Cued"
                      : state === "live"
                        ? "On air"
                        : state === "done"
                          ? "Played"
                          : state === "next"
                            ? "Next"
                            : "Later"}
                  </span>
                </div>
              );
            })}
          </div>
          {canSetup && (
            <button
              className="bc__poolBtn"
              type="button"
              onClick={() => setSheet({ kind: "series" })}
            >
              Edit series
              <span className="bc__caret" aria-hidden>
                <CaretDown size={14} weight="bold" />
              </span>
            </button>
          )}
        </div>
      )}

      <div className={`bc__grid${sided ? "" : " bc__grid--solo"}`}>
        {sided ? (
          <>
            <div className="bc__col bc__ctcol">
              <Head
                name={nameFor("ct") || "Counter-Terrorists"}
                count={ct.length}
                nameRight
              />
              {ct.map((p) => (
                <Row
                  key={p.steamId}
                  p={p}
                  topKills={topKills}
                  canKick={canModerate}
                  onKick={(pl) => setSheet({ kind: "kick", player: pl })}
                  setup={rowSetup(p, "ct")}
                  nameRight
                />
              ))}
              {!ct.length && (
                <p className="bc__sbEmpty">
                  {canSetup
                    ? "Nobody on this side. Move someone across, or off the bench."
                    : "Nobody on this side."}
                </p>
              )}
            </div>

            <div className="bc__standby">
              <div className="bc__sbHead">
                <span>
                  {canSetup ? "Bench" : "Spectating"} · {spec.length}
                </span>
                {canSetup && (
                  <button
                    className="bc__move"
                    type="button"
                    onClick={() => setSheet({ kind: "lineups" })}
                  >
                    Lineups
                  </button>
                )}
              </div>
              {turn && spec.length > 0 && (
                /*
                  Whose pick it is, derived from the two roster sizes rather
                  than counted. Someone leaves, someone joins late, someone is
                  moved by hand — a stored turn pointer would go on pointing at
                  the side that is already a player up.
                */
                <p className="bc__turn">
                  {nameFor(teamOn("ct") === turn ? "ct" : "t") || "Team"} picks
                  next
                </p>
              )}
              {spec.map((p) => (
                <div
                  key={p.steamId}
                  className={`bc__sbRow${
                    canSetup && setup.sides[p.steamId] !== setupCurrent.sides[p.steamId]
                      ? " bc__row--moved"
                      : ""
                  }`}
                >
                  {canSetup && (
                    <span className="bc__moves">
                      <button
                        className="bc__move"
                        type="button"
                        onClick={() => stageSide(p.steamId, teamOn("ct"))}
                        title={`Move ${p.name} to ${nameFor("ct") || "Counter-Terrorists"}`}
                      >
                        {"\u25c2 CT"}
                      </button>
                    </span>
                  )}
                  <span className="bc__sbName">{p.name}</span>
                  <span className="bc__moves">
                    {canSetup && (
                      <button
                        className="bc__move"
                        type="button"
                        onClick={() => stageSide(p.steamId, teamOn("t"))}
                        title={`Move ${p.name} to ${nameFor("t") || "Terrorists"}`}
                      >
                        {"T \u25b8"}
                      </button>
                    )}
                    {canModerate && (
                      <button
                        className="bc__move bc__move--now"
                        type="button"
                        onClick={() => setSheet({ kind: "kick", player: p })}
                      >
                        Kick
                      </button>
                    )}
                  </span>
                </div>
              ))}
              {!spec.length && (
                <p className="bc__sbEmpty">
                  {canSetup
                    ? "Everyone connected is on a side. Bench someone with the button on their row."
                    : "Nobody spectating."}
                </p>
              )}
            </div>

            <div className="bc__col bc__tcol">
              <Head name={nameFor("t") || "Terrorists"} count={t.length} />
              {t.map((p) => (
                <Row
                  key={p.steamId}
                  p={p}
                  topKills={topKills}
                  canKick={canModerate}
                  onKick={(pl) => setSheet({ kind: "kick", player: pl })}
                  setup={rowSetup(p, "t")}
                />
              ))}
              {!t.length && (
                <p className="bc__sbEmpty">
                  {canSetup
                    ? "Nobody on this side. Move someone across, or off the bench."
                    : "Nobody on this side."}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="bc__col bc__solocol">
            <Head name="Scoreboard" count={roster.length} />
            {[...roster]
              .sort((a, b) => b.k - a.k)
              .map((p, i) => (
                <Row
                  key={p.steamId}
                  p={p}
                  rank={i + 1}
                  topKills={topKills}
                  canKick={canModerate}
                  onKick={(pl) => setSheet({ kind: "kick", player: pl })}
                />
              ))}
            {!roster.length && <p className="bc__sbEmpty">Nobody is connected.</p>}
          </div>
        )}
      </div>

      {/*
        Said once, and only to someone who could otherwise have used them.
        Naming the plugin matters: "teams are unavailable" sends people looking
        for a setting, and there is no setting — there is an install.
      */}
      {canModerate && sided && !matchzy && (
        <p className="bc__absent">
          Team names, rosters and series length need MatchZy, which this server
          is not running. Everything else on this page works without it.
        </p>
      )}

      {/*
        Practice has a set of controls no other mode has any use for, so they
        appear with the mode and leave with it. Mounted conditionally rather
        than hidden: the hook behind them polls the server every few seconds.
      */}
      {canModerate && <PracticeStrip enabled={status.gameMode === "practice"} />}

      {/*
        Health, under the roster. See `.bc__health` for why it is a strip and
        not three tiles: it answers a real question, it just stops being the
        thing you scroll past to reach the answer you came for.

        There was an FPS reading here once. CS2 removed the `stats` table that
        reported server framerate, so it was the constant 0 presented as
        telemetry, and it is gone rather than faked.
      */}
      <div className="bc__health">
        <span className="bc__healthItem">
          CPU <span className="bc__healthVal">{status.cpuPct}%</span>
        </span>
        <span className="bc__healthItem">
          Memory
          <span className="bc__healthVal">
            {(status.memMb / 1024).toFixed(1)} / {(status.memMaxMb / 1024).toFixed(1)} GB
          </span>
          <span className="bc__healthBar" aria-hidden>
            <span
              style={{
                width: `${status.memMaxMb ? Math.min(100, (status.memMb / status.memMaxMb) * 100) : 0}%`,
              }}
            />
          </span>
        </span>
        <span className="bc__healthItem">
          Uptime <span className="bc__healthVal">{uptime(status.uptimeSec)}</span>
        </span>
        {status.vacSecure !== null && (
          <span className="bc__healthItem">
            VAC
            <span
              className={`bc__healthVal${status.vacSecure ? "" : " bc__healthVal--bad"}`}
              title={
                status.vacSecure
                  ? undefined
                  : "The server is running but unlisted and unprotected — usually a dead or missing GSLT. Reissue it at steamcommunity.com/dev/managegameservers."
              }
            >
              {status.vacSecure ? "Secure" : "Insecure"}
            </span>
          </span>
        )}
        {status.build !== null && (
          <span className="bc__healthItem">
            Build <span className="bc__healthVal">{status.build}</span>
          </span>
        )}
        {status.gotv && (
          <span className="bc__healthItem">
            GOTV <span className="bc__healthVal">{status.gotv.address}</span>
          </span>
        )}
      </div>

      {/*
        The dock. Two pills, because there are two kinds of commitment here:
        interventions that happen the moment you press them, and edits that sit
        in preview until you apply them.
      */}
      <div className="bc__dock">
        {said && <span className="bc__undo">{said}</span>}

        {pendingOp?.kind === "map" && (
          <span className="bc__loading">
            <span className="bc__loadingDot" aria-hidden />
            Loading {label(pendingOp.target ?? status.map)} ·{" "}
            <b>{formatElapsed(elapsedSec)}</b>
            <span className="bc__loadingWhy">
              a map the server has not cached downloads first
            </span>
          </span>
        )}

        {allChips.length > 0 && !apply.isPending && (
          <div className="bc__chips">
            {allChips.map((c) => (
              <span
                key={c.key}
                className={`bc__chip${c.note ? " bc__chip--heavy" : ""}`}
              >
                {c.label} <em>{c.to}</em>
                {c.note && <span className="bc__chipNote">{c.note}</span>}
                <button
                  className="bc__chipX"
                  type="button"
                  onClick={c.onDismiss}
                  aria-label={`Drop ${c.label} change`}
                >
                  <X size={11} weight="bold" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="bc__bars">
          {canModerate && (
            <div className="bc__pill bc__nowPill">
              <div className="bc__nowRow">
                <span className="bc__pillTag">Happens now</span>
                {NOW_ACTIONS.map((a, i) => (
                  <button
                    key={a.id}
                    className={`bc__act${i > 0 ? " bc__act--hideSm" : ""}`}
                    type="button"
                    disabled={now.isPending}
                    onClick={() => setSheet({ kind: "now", action: a })}
                  >
                    <span className="bc__actGlyph" aria-hidden>
                      <a.Icon size={16} weight="bold" />
                    </span>
                    <span className="bc__actLabel">{a.label}</span>
                    <span className="bc__actSay">
                      {a.label} — {a.hint} · {a.rcon}
                    </span>
                  </button>
                ))}
                <button
                  className="bc__act bc__more"
                  type="button"
                  onClick={() => setSheet({ kind: "more" })}
                >
                  <span className="bc__actGlyph" aria-hidden>
                    <DotsThree size={18} weight="bold" />
                  </span>
                  <span className="bc__actLabel">More</span>
                  <span className="bc__actSay">
                    More — knife, swap, demo, end
                  </span>
                </button>
                <button
                  className="bc__act bc__act--danger bc__act--hideSm"
                  type="button"
                  disabled={endMatch.isPending}
                  onClick={() => setSheet({ kind: "end" })}
                >
                  <span className="bc__actGlyph" aria-hidden>
                    <Stop size={16} weight="fill" />
                  </span>
                  <span className="bc__actLabel">End match</span>
                  <span className="bc__actSay">
                    End match — drops the series, the panel keeps the stats
                  </span>
                </button>
              </div>
              <span className="bc__nowSay">
                {allChips.length
                  ? `${allChips.length} change${allChips.length === 1 ? "" : "s"} staged · nothing has reached the server`
                  : matchzyOwns
                    ? "MatchZy is running this match — it owns the mode, the round limit and overtime."
                    : "Point at anything to see what it does."}
              </span>
            </div>
          )}

          {apply.isPending && (
            <div className="bc__pill bc__progWrap">
              <span className="bc__pillTag">Applying</span>
              <span className="bc__commitCopy">
                <span className="bc__commitLine">
                  Sending {steps.length + setupChips.length} change
                  {steps.length + setupChips.length === 1 ? "" : "s"} to the
                  server…
                </span>
                <span className="bc__commitSub">
                  {setupChips.length
                    ? "Loading the match config — MatchZy restarts the match."
                    : heavy
                      ? "The map is reloading — this takes about a minute."
                      : "Waiting for RCON to acknowledge."}
                </span>
              </span>
              <span className="bc__prog" aria-hidden />
            </div>
          )}

          {allChips.length > 0 && !apply.isPending && (
            <div className="bc__pill bc__pill--commit">
              <span className="bc__pillTag">Staged</span>
              <span className="bc__commitCopy">
                <span className="bc__commitLine">
                  {blocked
                    ? setupIssues[0]
                    : "Nothing has reached the server yet."}
                </span>
                <span className="bc__commitSub">
                  {blocked
                    ? "Fix that and the match config can be loaded."
                    : needsReload
                      ? "The mode is read when a map loads — pick a map too, or it lands on the next one."
                      : "Edits sit here until you apply them."}
                </span>
              </span>
              <button
                className="bc__discard"
                type="button"
                onClick={() => {
                  setDraft({});
                  setSetupDraft({});
                }}
              >
                Discard
              </button>
              <button
                className="bc__apply"
                type="button"
                /*
                  A match config is not one more cvar: loading it restarts the
                  match, runs MatchZy's own knife round and rewrites the
                  hostname. So that tier goes through a confirmation and the
                  cvar tier does not — the asymmetry is the point.
                */
                onClick={() =>
                  setupChips.length
                    ? setSheet({ kind: "apply" })
                    : apply.mutate()
                }
                disabled={(!steps.length && !setupChips.length) || blocked}
              >
                <span className="bc__applyLabel">
                  Apply {allChips.length} change
                  {allChips.length === 1 ? "" : "s"}
                </span>
                <span className="bc__applyHint">
                  {setupChips.length
                    ? "restarts the match — asks first"
                    : heavy
                      ? "reloads the level, nobody is dropped"
                      : "applies immediately, nobody is dropped"}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- sheets ---------------- */}

      {sheet && (
        <div className="bc__scrim" onClick={() => setSheet(null)} aria-hidden />
      )}

      {sheet?.kind === "pool" && (
        <div className="bc__sheet" role="dialog" aria-modal aria-label="Change the map">
          <div className="bc__sheetHead">
            <div className="bc__sheetTitle">Change the map</div>
            <p className="bc__sheetSub">
              Picking one cues it. It does not load until you apply — and loading
              it takes about a minute while the server downloads and everyone
              waits in place.
            </p>
          </div>
          <div className="bc__sheetBody">
            <div className="bc__poolGrid">
              {mapList.map((m) => {
                const on = m.name === status.map;
                const cued = m.name === stagedMap && m.name !== status.map;
                const art = getOfficialMapArtPath(m.name) ?? m.thumbnailUrl;
                return (
                  <button
                    key={m.name}
                    type="button"
                    className={`bc__poolMap${on ? " bc__poolMap--on" : ""}${cued ? " bc__poolMap--cued" : ""}`}
                    onClick={() => {
                      setDraft((d) => ({ ...d, map: m.name }));
                      setSheet(null);
                    }}
                  >
                    {art && (
                      <span
                        className="bc__rdArt"
                        style={{ backgroundImage: `url(${art})` }}
                        aria-hidden
                      />
                    )}
                    <span className="bc__rdName">{m.displayName}</span>
                    <span className="bc__rdNote">
                      {on ? "On air" : cued ? "Cued" : m.type}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="bc__sheetFoot">
            <span className="bc__count">
              {mapList.length} map{mapList.length === 1 ? "" : "s"} installed
            </span>
            <span className="bc__sheetSpacer" />
            <button className="bc__btn" type="button" onClick={() => setSheet(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      {sheet?.kind === "series" && (
        <div
          className="bc__sheet"
          role="dialog"
          aria-modal
          aria-label="The series"
        >
          <div className="bc__sheetHead">
            <div className="bc__sheetTitle">The series</div>
            <p className="bc__sheetSub">
              Which maps, in what order, and how the series ends. Staged like
              everything else — none of it reaches the server until you apply.
            </p>
          </div>
          <div className="bc__sheetBody">
            <div className="bc__field">
              <span className="bc__fieldLabel">Pool</span>
              <div className="bc__poolRow">
                <button
                  className="bc__btn"
                  type="button"
                  onClick={() =>
                    setSetupDraft((d) => ({
                      ...d,
                      maps: activeDutyPool(mapList.map((m) => m.name)).present,
                    }))
                  }
                >
                  Active Duty
                </button>
                <button
                  className="bc__btn"
                  type="button"
                  onClick={() =>
                    setSetupDraft((d) => ({
                      ...d,
                      maps: RESERVE.filter((m) =>
                        mapList.some((entry) => entry.name === m),
                      ),
                    }))
                  }
                >
                  Reserve
                </button>
                <button
                  className="bc__btn"
                  type="button"
                  onClick={() => setSetupDraft((d) => ({ ...d, maps: [] }))}
                >
                  Clear
                </button>
              </div>
              {/*
                A dated snapshot, printed rather than hidden: nothing the
                server reports says which maps Valve currently calls Active
                Duty, so a stale list should be visible instead of quietly
                wrong.
              */}
              <span className="bc__limitHint">
                Active Duty as of {ACTIVE_DUTY_AS_OF}
                {(() => {
                  const missing = activeDutyPool(mapList.map((m) => m.name))
                    .missing.length;
                  return missing
                    ? ` · this server is missing ${missing} of the pool`
                    : "";
                })()}
              </span>
            </div>

            <div className="bc__field">
              <span className="bc__fieldLabel">
                Maps · {setup.maps.length} picked, best of {setup.numMaps}
              </span>
              <div className="bc__poolGrid">
                {mapList.map((m) => {
                  const at = setup.maps.indexOf(m.name);
                  const art = getOfficialMapArtPath(m.name) ?? m.thumbnailUrl;
                  return (
                    <button
                      key={m.name}
                      type="button"
                      className={`bc__poolMap${at >= 0 ? " bc__poolMap--cued" : ""}`}
                      onClick={() =>
                        setSetupDraft((d) => {
                          const maps = resolveSetup(setupCurrent, d).maps;
                          return {
                            ...d,
                            maps:
                              at >= 0
                                ? maps.filter((x) => x !== m.name)
                                : [...maps, m.name],
                          };
                        })
                      }
                    >
                      {art && (
                        <span
                          className="bc__rdArt"
                          style={{ backgroundImage: `url(${art})` }}
                          aria-hidden
                        />
                      )}
                      <span className="bc__rdName">{m.displayName}</span>
                      <span className="bc__rdNote">
                        {at >= 0 ? `Pick ${at + 1}` : m.type}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bc__field">
              <span className="bc__fieldLabel">How it runs</span>
              <button
                type="button"
                role="switch"
                aria-checked={setup.skipVeto}
                className={`bc__switch${setup.skipVeto ? " bc__switch--on" : ""}${setup.skipVeto !== setupCurrent.skipVeto ? " bc__switch--staged" : ""}`}
                onClick={() =>
                  setSetupDraft((d) => ({ ...d, skipVeto: !setup.skipVeto }))
                }
              >
                <span className="bc__track" aria-hidden>
                  <span className="bc__knob" />
                </span>
                Skip the veto
              </button>
              <span className="bc__limitHint">
                {setup.skipVeto
                  ? "The maps above are played in the order they are picked."
                  : "MatchZy runs the veto in game, with the captains typing .ban and .pick."}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={setup.clinchSeries}
                className={`bc__switch${setup.clinchSeries ? " bc__switch--on" : ""}${setup.clinchSeries !== setupCurrent.clinchSeries ? " bc__switch--staged" : ""}`}
                onClick={() =>
                  setSetupDraft((d) => ({
                    ...d,
                    clinchSeries: !setup.clinchSeries,
                  }))
                }
              >
                <span className="bc__track" aria-hidden>
                  <span className="bc__knob" />
                </span>
                Stop when decided
              </button>
              <span className="bc__limitHint">
                {setup.clinchSeries
                  ? "A best-of-3 ends at 2-0 instead of playing a dead third map."
                  : "Every map is played, even once the series is decided."}
              </span>
            </div>

            {setupIssues.length > 0 && (
              <ul className="bc__issues">
                {setupIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="bc__sheetFoot">
            <span className="bc__sheetSpacer" />
            <button
              className="bc__btn"
              type="button"
              onClick={() => setSheet(null)}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {sheet?.kind === "lineups" && (
        <div
          className="bc__sheet"
          role="dialog"
          aria-modal
          aria-label="Saved lineups"
        >
          <div className="bc__sheetHead">
            <div className="bc__sheetTitle">Lineups</div>
            <p className="bc__sheetSub">
              The same twelve people most Fridays. Every apply saves what it
              loaded, so these accumulate on their own. Picking one stages the
              whole thing — names, sides, captains and the series — as one
              change you can still review.
            </p>
          </div>
          <div className="bc__sheetBody">
            {saved.isPending && <p className="bc__sbEmpty">Loading…</p>}
            {!saved.isPending && !saved.data?.length && (
              <p className="bc__sbEmpty">
                Nothing saved yet. Set up a match and apply it, and it lands
                here.
              </p>
            )}
            {saved.data?.map((entry) => {
              const def = entry.definition;
              /*
                Only people who are actually connected can be staged: the
                config is built from the live roster, and a name in a saved
                lineup who is not here tonight would be a roster slot MatchZy
                waits forever for.
              */
              const here = (ids: string[]) =>
                ids.filter((id) => roster.some((p) => p.steamId === id));
              const ids1 = here(def.team1.players.map((p) => p.steamId));
              const ids2 = here(def.team2.players.map((p) => p.steamId));
              const absent =
                def.team1.players.length +
                def.team2.players.length -
                ids1.length -
                ids2.length;
              return (
                <button
                  key={entry.id}
                  className="bc__lineup"
                  type="button"
                  onClick={() => {
                    const sides: Record<string, SetupSide> = {};
                    for (const p of roster) sides[p.steamId] = "bench";
                    for (const id of ids1) sides[id] = "team1";
                    for (const id of ids2) sides[id] = "team2";
                    setSetupDraft({
                      team1Name: def.team1.name,
                      team2Name: def.team2.name,
                      sides,
                      captains: {
                        team1: ids1[0] ?? null,
                        team2: ids2[0] ?? null,
                      },
                      numMaps: def.numMaps,
                      maps: def.maps,
                      skipVeto: def.skipVeto,
                      clinchSeries: def.clinchSeries,
                    });
                    setSheet(null);
                  }}
                >
                  <span>
                    <span className="bc__lineupName">
                      {def.team1.name} vs {def.team2.name}
                    </span>
                    <br />
                    <span className="bc__lineupNote">
                      Best of {def.numMaps} ·{" "}
                      {ids1.length + ids2.length} of{" "}
                      {def.team1.players.length + def.team2.players.length}{" "}
                      here
                      {absent ? ` · ${absent} not connected` : ""}
                      {entry.loadedAt
                        ? ` · last run ${new Date(entry.loadedAt).toLocaleDateString()}`
                        : " · never run"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="bc__sheetFoot">
            <span className="bc__sheetSpacer" />
            <button
              className="bc__btn"
              type="button"
              onClick={() => setSheet(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {sheet?.kind === "backups" && (
        <div
          className="bc__sheet"
          role="dialog"
          aria-modal
          aria-label="Round backups"
        >
          <div className="bc__sheetHead">
            <div className="bc__sheetTitle">Round backups</div>
            <p className="bc__sheetSub">
              MatchZy saves one at the start of every round. Restoring puts the
              match back to that round for everyone — score, sides and money go
              with it, and the rounds played since are undone. It happens the
              moment you press it.
            </p>
          </div>
          <div className="bc__sheetBody" style={{ padding: 0 }}>
            {backups.isPending && <p className="bc__sbEmpty">Loading…</p>}
            {!backups.isPending && !backups.data?.length && (
              <p className="bc__sbEmpty">
                No backups yet. MatchZy writes them once a match is live.
              </p>
            )}
            {backups.data?.map((b) => (
              <button
                key={b.fileName}
                className="bc__moreRow"
                type="button"
                disabled={restore.isPending}
                onClick={() => restore.mutate(b.round)}
              >
                <span className="bc__actGlyph" aria-hidden>
                  <ArrowCounterClockwise size={16} weight="bold" />
                </span>
                <span>
                  <span className="bc__actLabel">Round {b.round}</span>
                  <br />
                  <span className="bc__actHint">
                    saved {new Date(b.savedAt).toLocaleTimeString()}
                  </span>
                </span>
                <span className="bc__moreMeta">css_restore {b.round}</span>
              </button>
            ))}
          </div>
          <div className="bc__sheetFoot">
            <span className="bc__sheetSpacer" />
            <button
              className="bc__btn"
              type="button"
              onClick={() => setSheet(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {sheet?.kind === "apply" && (
        <div
          className="bc__sheet"
          role="dialog"
          aria-modal
          aria-label="Load the match config"
        >
          <div className="bc__sheetHead">
            <div className="bc__sheetTitle">Load this match?</div>
            <p className="bc__sheetSub">
              Teams, rosters and the series are one config, and MatchZy takes it
              whole. Loading it restarts the match on {label(status.map)}
              {match && match.phase === "live"
                ? `, ending the one at ${match.score.ct}-${match.score.t}`
                : ""}
              , runs its own knife round, and rewrites the server name from
              MatchZy&apos;s hostname format. Nobody is disconnected.
            </p>
            <code className="bc__rcon">
              matchzy_loadmatch_url · {setupId(setup)}
            </code>
          </div>
          <div className="bc__sheetBody">
            <div className="bc__chips">
              {allChips.map((c) => (
                <span key={c.key} className="bc__chip">
                  {c.label} <em>{c.to}</em>
                </span>
              ))}
            </div>
          </div>
          <div className="bc__sheetFoot">
            <button
              className="bc__btn"
              type="button"
              onClick={() => setSheet(null)}
            >
              Keep staging
            </button>
            <span className="bc__sheetSpacer" />
            <button
              className="bc__btn bc__btn--danger"
              type="button"
              disabled={apply.isPending || blocked}
              onClick={() => apply.mutate()}
            >
              Load the match
            </button>
          </div>
        </div>
      )}

      {sheet?.kind === "more" && (
        <div className="bc__sheet" role="dialog" aria-modal aria-label="Match actions">
          <div className="bc__sheetHead">
            <div className="bc__sheetTitle">Happens now</div>
            <p className="bc__sheetSub">
              None of these are staged. They reach the server the moment you
              confirm them.
            </p>
          </div>
          <div className="bc__sheetBody" style={{ padding: 0 }}>
            {NOW_ACTIONS.map((a) => (
              <button
                key={a.id}
                className="bc__moreRow"
                type="button"
                onClick={() => setSheet({ kind: "now", action: a })}
              >
                <span className="bc__actGlyph" aria-hidden>
                  <a.Icon size={16} weight="bold" />
                </span>
                <span>
                  <span className="bc__actLabel">{a.label}</span>
                  <br />
                  <span className="bc__actHint">{a.hint}</span>
                </span>
                <span className="bc__moreMeta">{a.rcon}</span>
              </button>
            ))}
            {/*
              The phase commands, which are not a staged setting and not a
              MatchZy concept — `mp_warmup_start` and `mp_warmup_end` are
              vanilla, and they are how a night without the plugin gets from
              milling about to playing.
            */}
            <button
              className="bc__moreRow"
              type="button"
              disabled={phase.isPending}
              onClick={() => phase.mutate("warmup")}
            >
              <span className="bc__actGlyph" aria-hidden>
                <UsersThree size={16} weight="bold" />
              </span>
              <span>
                <span className="bc__actLabel">Back to warmup</span>
                <br />
                <span className="bc__actHint">open the server up again</span>
              </span>
              <span className="bc__moreMeta">mp_warmup_start</span>
            </button>
            <button
              className="bc__moreRow"
              type="button"
              disabled={phase.isPending}
              onClick={() => phase.mutate("live")}
            >
              <span className="bc__actGlyph" aria-hidden>
                <FlagCheckered size={16} weight="bold" />
              </span>
              <span>
                <span className="bc__actLabel">Go live</span>
                <br />
                <span className="bc__actHint">
                  ends warmup and restarts in 3
                </span>
              </span>
              <span className="bc__moreMeta">mp_warmup_end</span>
            </button>
            {matchzy && (
              <button
                className="bc__moreRow"
                type="button"
                onClick={() => setSheet({ kind: "backups" })}
              >
                <span className="bc__actGlyph" aria-hidden>
                  <ArrowCounterClockwise size={16} weight="bold" />
                </span>
                <span>
                  <span className="bc__actLabel">Round backups</span>
                  <br />
                  <span className="bc__actHint">
                    put the match back to an earlier round
                  </span>
                </span>
                <span className="bc__moreMeta">css_restore</span>
              </button>
            )}
            <button
              className="bc__moreRow bc__moreRow--danger"
              type="button"
              onClick={() => setSheet({ kind: "end" })}
            >
              <span className="bc__actGlyph" aria-hidden>
                <Stop size={16} weight="fill" />
              </span>
              <span>
                <span className="bc__actLabel">End match</span>
                <br />
                <span className="bc__actHint">drops the series</span>
              </span>
              <span className="bc__moreMeta">.forceend</span>
            </button>
          </div>
        </div>
      )}

      {sheet?.kind === "now" && (
        <div
          className="bc__sheet"
          role="dialog"
          aria-modal
          aria-label={sheet.action.label}
        >
          <div className="bc__sheetHead">
            <div className="bc__sheetTitle">{sheet.action.label}?</div>
            <p className="bc__sheetSub">{sheet.action.consequence(nowCtx)}</p>
            <code className="bc__rcon">rcon {sheet.action.rcon}</code>
          </div>
          <div className="bc__sheetFoot">
            <button className="bc__btn" type="button" onClick={() => setSheet(null)}>
              Cancel
            </button>
            <span className="bc__sheetSpacer" />
            <button
              className="bc__btn"
              type="button"
              disabled={now.isPending}
              onClick={() => now.mutate(sheet.action)}
            >
              {sheet.action.label} now
            </button>
          </div>
        </div>
      )}

      {sheet?.kind === "kick" && (
        <div
          className="bc__sheet"
          role="dialog"
          aria-modal
          aria-label={`Kick ${sheet.player.name}`}
        >
          <div className="bc__sheetHead">
            <div className="bc__sheetTitle">Kick {sheet.player.name}?</div>
            <p className="bc__sheetSub">
              Removes them from the server right now. A kick is not a ban — they
              can reconnect immediately — and their {sheet.player.k} kills stay
              on the scoreboard for this map.
            </p>
            <code className="bc__rcon">
              rcon kickid {sheet.player.userId ?? sheet.player.steamId}
            </code>
          </div>
          <div className="bc__sheetFoot">
            <button className="bc__btn" type="button" onClick={() => setSheet(null)}>
              Cancel
            </button>
            {/*
              The escalation, where you already are. Deciding a kick is not
              enough happens *while* looking at the kick sheet, so the ban is
              one button across rather than a different surface you have to
              remember exists.
            */}
            <button
              className="bc__btn"
              type="button"
              onClick={() => {
                const player = sheet.player;
                setBanMinutes(60);
                setBanReason("");
                setSheet({ kind: "ban", player });
              }}
            >
              Ban instead…
            </button>
            <span className="bc__sheetSpacer" />
            <button
              className="bc__btn bc__btn--danger"
              type="button"
              disabled={kick.isPending}
              onClick={() => kick.mutate(sheet.player)}
            >
              Kick {sheet.player.name}
            </button>
          </div>
        </div>
      )}

      {sheet?.kind === "ban" && (
        <div
          className="bc__sheet"
          role="dialog"
          aria-modal
          aria-label={`Ban ${sheet.player.name}`}
        >
          <div className="bc__sheetHead">
            <div className="bc__sheetTitle">Ban {sheet.player.name}?</div>
            <p className="bc__sheetSub">
              They are removed now and cannot rejoin until the ban lifts. The
              panel keeps the clock: CS2 holds bans in memory only and forgets
              them when the container restarts, so the panel re-applies them
              once RCON reconnects — which is the only reason the length below
              means anything.
            </p>
            <code className="bc__rcon">rcon banid 0 {sheet.player.steamId}</code>
          </div>
          <div className="bc__sheetBody">
            <div className="bc__field">
              <span className="bc__fieldLabel">Length</span>
              <div className="bc__seg" role="group" aria-label="Ban length">
                {BAN_DURATIONS.map((minutes) => (
                  <button
                    key={String(minutes)}
                    type="button"
                    aria-pressed={banMinutes === minutes}
                    className={`bc__segBtn${banMinutes === minutes ? " bc__segBtn--on" : ""}`}
                    onClick={() => setBanMinutes(minutes)}
                  >
                    {formatDuration(minutes)}
                  </button>
                ))}
              </div>
            </div>
            <div className="bc__field">
              <label className="bc__fieldLabel" htmlFor="bc-ban-reason">
                Reason
              </label>
              <input
                id="bc-ban-reason"
                className="bc__input"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Recorded by the panel, never shown to the player"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="bc__sheetFoot">
            <button
              className="bc__btn"
              type="button"
              onClick={() => setSheet({ kind: "kick", player: sheet.player })}
            >
              Back to kick
            </button>
            <span className="bc__sheetSpacer" />
            <button
              className="bc__btn bc__btn--danger"
              type="button"
              disabled={ban.isPending}
              onClick={() => ban.mutate(sheet.player)}
            >
              Ban for {formatDuration(banMinutes)}
            </button>
          </div>
        </div>
      )}

      {sheet?.kind === "end" && (
        <div className="bc__sheet" role="dialog" aria-modal aria-label="End the match">
          <div className="bc__sheetHead">
            <div className="bc__sheetTitle">End the match?</div>
            <p className="bc__sheetSub">
              Ends the match on {label(status.map)}
              {match ? `, round ${match.round}, at ${match.score.ct}-${match.score.t}` : ""}.
              All {roster.length} connected player
              {roster.length === 1 ? "" : "s"} drop to warmup. A demo that is
              recording is kept.
            </p>
            <code className="bc__rcon">rcon .forceend</code>
          </div>
          <div className="bc__sheetFoot">
            <button className="bc__btn" type="button" onClick={() => setSheet(null)}>
              Keep playing
            </button>
            <span className="bc__sheetSpacer" />
            <button
              className="bc__btn bc__btn--danger"
              type="button"
              disabled={endMatch.isPending}
              onClick={() => endMatch.mutate()}
            >
              End the match
            </button>
          </div>
        </div>
      )}
    </>
  );
}
