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
 * What is deliberately *not* here yet: captains, side moves and team names.
 * Those are a MatchZy match config, not a live RCON write, so they belong to
 * the draft flow on `/match` until that is ported too. Rendering them here
 * would mean drawing controls that stage something nothing can apply.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CaretDown,
  DotsThree,
  Pause,
  Play,
  Knife,
  ArrowsLeftRight,
  Record,
  Stop,
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
import { PRESETS } from "@/lib/presets";
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
  | { kind: "more" }
  | { kind: "now"; action: NowAction }
  | { kind: "kick"; player: Player }
  | { kind: "ban"; player: Player }
  | { kind: "end" };

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

function Row({
  p,
  /** Longest bar on the board, so the meter is relative to the night's top fragger. */
  topKills,
  rank,
  canKick,
  onKick,
  nameRight,
}: {
  p: Player;
  topKills: number;
  rank?: number;
  canKick: boolean;
  onKick: (p: Player) => void;
  nameRight?: boolean;
}) {
  return (
    <div className={`bc__row bc__row--${nameRight ? "r" : "l"}`}>
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
      </span>
      <Stats p={p} />
      <span className="bc__moves">
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
 * Read, not written: renaming a side means loading a MatchZy match config, so
 * an editable field here would promise something nothing can apply.
 */
function Side({
  side,
  count,
  score,
  name,
}: {
  side: "ct" | "t";
  count: number;
  score: number;
  name: string;
}) {
  return (
    <div className={`bc__side${side === "t" ? " bc__side--t bc__t" : " bc__ct"}`}>
      <span className="bc__sideMark" aria-hidden />
      <span className="bc__team">
        <span className="bc__tag">
          {side === "ct" ? "Counter-Terrorists" : "Terrorists"} · {count}
        </span>
        <span className="bc__nameRead">{name}</span>
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
  const ct = roster.filter((p) => p.team === "CT");
  const t = roster.filter((p) => p.team === "T");
  const spec = roster.filter((p) => p.team === "SPEC");
  const topKills = Math.max(0, ...roster.map((p) => p.k));

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
      for (const step of steps) {
        if (step.kind === "cvar") await api.setCvar(step.name, step.value);
        else if (step.kind === "config") await api.putConfig(step.config);
        else await api.changeMap(step.name);
      }
    },
    meta: { action: "Apply" },
    onSuccess: () => {
      const changedMap = steps.some((s) => s.kind === "map");
      toast.success(
        `Applied ${steps.length} change${steps.length === 1 ? "" : "s"}`,
        {
          description: changedMap
            ? "A map the server has not cached downloads first — allow about a minute."
            : undefined,
        },
      );
      setDraft({});
      qc.invalidateQueries({ queryKey: ["status"] });
      qc.invalidateQueries({ queryKey: ["config"] });
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

  const NOW_ACTIONS: NowAction[] = [
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

  const heavy = chips.some((c) => c.key === "map");

  /* ---------------- render ---------------- */


  return (
    <>
      <div className={`bc__band${sided ? "" : " bc__band--solo"}`}>
        {sided && (
          <Side
            side="ct"
            count={ct.length}
            score={match?.score.ct ?? 0}
            name={match?.series?.team1.name ?? "Counter-Terrorists"}
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
                    : dirty.length
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
            name={match?.series?.team2.name ?? "Terrorists"}
          />
        )}
      </div>

      <div className={`bc__grid${sided ? "" : " bc__grid--solo"}`}>
        {sided ? (
          <>
            <div className="bc__col bc__ctcol">
              <Head name="Counter-Terrorists" count={ct.length} nameRight />
              {ct.map((p) => (
                <Row
                  key={p.steamId}
                  p={p}
                  topKills={topKills}
                  canKick={canModerate}
                  onKick={(pl) => setSheet({ kind: "kick", player: pl })}
                  nameRight
                />
              ))}
              {!ct.length && <p className="bc__sbEmpty">Nobody on this side.</p>}
            </div>

            <div className="bc__standby">
              <div className="bc__sbHead">Spectating · {spec.length}</div>
              {spec.map((p) => (
                <div key={p.steamId} className="bc__sbRow">
                  <span className="bc__sbName">{p.name}</span>
                  {canModerate && (
                    <button
                      className="bc__move bc__move--now"
                      type="button"
                      onClick={() => setSheet({ kind: "kick", player: p })}
                    >
                      Kick
                    </button>
                  )}
                </div>
              ))}
              {!spec.length && <p className="bc__sbEmpty">Nobody spectating.</p>}
            </div>

            <div className="bc__col bc__tcol">
              <Head name="Terrorists" count={t.length} />
              {t.map((p) => (
                <Row
                  key={p.steamId}
                  p={p}
                  topKills={topKills}
                  canKick={canModerate}
                  onKick={(pl) => setSheet({ kind: "kick", player: pl })}
                />
              ))}
              {!t.length && <p className="bc__sbEmpty">Nobody on this side.</p>}
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

        {chips.length > 0 && !apply.isPending && (
          <div className="bc__chips">
            {chips.map((c) => (
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
                {chips.length
                  ? `${chips.length} change${chips.length === 1 ? "" : "s"} staged · nothing has reached the server`
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
                  Sending {steps.length} change{steps.length === 1 ? "" : "s"} to
                  the server…
                </span>
                <span className="bc__commitSub">
                  {heavy
                    ? "The map is reloading — this takes about a minute."
                    : "Waiting for RCON to acknowledge."}
                </span>
              </span>
              <span className="bc__prog" aria-hidden />
            </div>
          )}

          {chips.length > 0 && !apply.isPending && (
            <div className="bc__pill bc__pill--commit">
              <span className="bc__pillTag">Staged</span>
              <span className="bc__commitCopy">
                <span className="bc__commitLine">
                  Nothing has reached the server yet.
                </span>
                <span className="bc__commitSub">
                  {needsReload
                    ? "The mode is read when a map loads — pick a map too, or it lands on the next one."
                    : "Edits sit here until you apply them."}
                </span>
              </span>
              <button
                className="bc__discard"
                type="button"
                onClick={() => setDraft({})}
              >
                Discard
              </button>
              <button
                className="bc__apply"
                type="button"
                onClick={() => apply.mutate()}
                disabled={!steps.length}
              >
                <span className="bc__applyLabel">
                  Apply {chips.length} change{chips.length === 1 ? "" : "s"}
                </span>
                <span className="bc__applyHint">
                  {heavy
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
