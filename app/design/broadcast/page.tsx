"use client";

/**
 * Direction 1 — BROADCAST, second pass.
 *
 * The first pass got the look but kept setup somewhere else, which is the exact
 * split the panel already has and the reason it never feels like one thing. So
 * this version has no setup screen at all: the scoreboard *is* the form. Every
 * value you can see is the control that changes it — team names, the map, the
 * series format, overtime, who is on which side — edited in place, at the size
 * it is displayed.
 *
 * The batching problem ("we don't want the server switching settings one by
 * one") is solved with the idiom the direction was already borrowing. A gallery
 * has two buses: PROGRAM is what is on air, PREVIEW is what you are building.
 * Edits land in preview and change nothing; the bar at the bottom lists exactly
 * what is staged; TAKE cuts all of it at once and CLEAR throws it away. One
 * mental model covers save-vs-discard, the blast radius, and the fact that a
 * live match is something you interrupt rather than a form you submit.
 *
 * Complexity is tied to the format, per the brief: pick anything that is not
 * Competitive and the rundown and the draft leave the screen entirely, because
 * an AWP map for six people has no veto and no captains.
 *
 * Look parameters are wired to DialKit (dialkit.dev) so they can be tuned live
 * instead of through another round trip — the panel is the bubble top-right.
 */

import { useMemo, useState } from "react";
import { DialRoot, useDialKit } from "dialkit";
import "dialkit/styles.css";
import {
  MATCH,
  SERVER,
  PLAYERS,
  STANDBY,
  MAP_POOL,
  SERIES_MAPS,
  PRESETS,
  mapArt,
  kd,
  type MockPlayer,
} from "@/lib/design/mock";

const css = `
.bc {
  --line: rgba(255,255,255,0.09);
  --stage: #06070a;
  min-height: calc(100svh - 32px);
  background: var(--stage);
  color: #fff;
  font-family: var(--font-geist-sans), system-ui, sans-serif;
  display: flex; flex-direction: column; position: relative; overflow: hidden;
}
.bc__art {
  position: absolute; inset: 0; background-size: cover; background-position: center 35%;
  filter: saturate(0.5) contrast(1.1);
}
.bc__veil {
  position: absolute; inset: 0;
  background:
    radial-gradient(120% 80% at 50% 0%, rgba(0,0,0,0.15), rgba(6,7,10,var(--veil)) 70%),
    linear-gradient(180deg, rgba(6,7,10,0.4) 0%, rgba(6,7,10,0.98) 62%);
}
.bc__body { position: relative; display: flex; flex-direction: column; flex: 1; min-height: 0; }

/* ---- top rail: which bus you are looking at, and the format ---- */
.bc__rail {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 9px 16px; border-bottom: 1px solid var(--line);
  background: rgba(0,0,0,0.42);
  font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
  color: rgba(255,255,255,0.45);
}
.bc__bus {
  display: inline-flex; align-items: center; gap: 7px; padding: 4px 9px;
  font-weight: 800; letter-spacing: 0.16em; color: #fff;
  background: var(--live); box-shadow: 0 0 22px -4px var(--live);
}
.bc__bus--pvw { background: var(--take); box-shadow: 0 0 22px -4px var(--take); color: #0a0a0a; }
.bc__rail b { color: #fff; font-weight: 700; letter-spacing: 0.06em; }
.bc__rec { color: var(--live); }
.bc__formats { display: flex; border: 1px solid var(--line); }
.bc__formats--rail { margin-left: auto; }
.bc__format {
  background: transparent; border: 0; cursor: pointer; padding: 6px 12px;
  font: inherit; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
  color: rgba(255,255,255,0.5); border-right: 1px solid var(--line);
}
.bc__format:last-child { border-right: 0; }
.bc__format:hover { color: #fff; background: rgba(255,255,255,0.06); }
.bc__format--on { background: #fff; color: #06070a; font-weight: 800; }
.bc__format--staged { background: var(--take); color: #0a0a0a; font-weight: 800; }

/* ---- the band ---- */
.bc__band { display: grid; grid-template-columns: 1fr auto 1fr; border-bottom: 1px solid var(--line); }
.bc__side { padding: var(--bandPad) 32px; display: flex; align-items: center; gap: 28px; }
.bc__side--t { flex-direction: row-reverse; text-align: right; }
.bc__sideMark { width: 6px; align-self: stretch; border-radius: 99px; }
.bc__ct .bc__sideMark { background: var(--ct); box-shadow: 0 0 40px 2px var(--ct); }
.bc__t .bc__sideMark { background: var(--t); box-shadow: 0 0 40px 2px var(--t); }
.bc__team { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
.bc__side--t .bc__team { align-items: flex-end; }
.bc__tag { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; font-weight: 600; }
.bc__ct .bc__tag { color: var(--ct); }
.bc__t .bc__tag { color: var(--t); }

/* the team name is an input that does not look like one until you touch it */
.bc__nameField {
  font: inherit; color: #fff; background: transparent; width: 100%;
  border: 1px solid transparent; padding: 2px 6px; margin: 0 -6px;
  font-size: calc(var(--teamSize) * 1px); font-weight: 800;
  letter-spacing: -0.02em; text-transform: uppercase; line-height: 1.05;
}
.bc__side--t .bc__nameField { text-align: right; }
.bc__nameField:hover { border-color: var(--line); }
.bc__nameField:focus { outline: none; border-color: var(--take); background: rgba(0,0,0,0.4); }
.bc__nameField--staged { border-color: var(--take); color: var(--take); }

.bc__score {
  font-size: clamp(48px, calc(var(--scoreSize) * 1vw), 132px);
  font-weight: 800; line-height: 0.8; letter-spacing: -0.05em;
  font-variant-numeric: tabular-nums;
}

.bc__centre {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 9px; padding: 22px; min-width: 250px;
  border-left: 1px solid var(--line); border-right: 1px solid var(--line);
  background: rgba(255,255,255,0.02);
}
.bc__live {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 11px; letter-spacing: 0.2em; font-weight: 700; text-transform: uppercase;
  color: var(--live);
}
.bc__dot { width: 7px; height: 7px; border-radius: 99px; background: var(--live); animation: bcpulse 1.6s ease-in-out infinite; }
@keyframes bcpulse { 0%,100% { opacity: 1; transform: scale(1);} 50% { opacity: 0.35; transform: scale(0.82);} }

.bc__mapBtn {
  background: transparent; border: 1px solid transparent; cursor: pointer; color: #fff;
  font: inherit; font-size: clamp(20px, 2.6vw, 34px); font-weight: 800;
  letter-spacing: -0.02em; text-transform: uppercase; padding: 2px 10px;
  display: inline-flex; align-items: center; gap: 9px;
}
.bc__mapBtn:hover { border-color: var(--line); }
.bc__mapBtn--staged { border-color: var(--take); color: var(--take); }
.bc__caret { font-size: 13px; opacity: 0.5; }
.bc__round { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255,255,255,0.5); font-variant-numeric: tabular-nums; }
.bc__ot {
  background: transparent; border: 1px solid var(--line); cursor: pointer; font: inherit;
  font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
  color: rgba(255,255,255,0.5); padding: 3px 8px;
}
.bc__ot:hover { color: #fff; }
.bc__ot--on { border-color: rgba(255,255,255,0.5); color: #fff; }
.bc__ot--staged { border-color: var(--take); color: var(--take); }
.bc__pips { display: flex; gap: 5px; }
.bc__pip { width: 26px; height: 4px; background: rgba(255,255,255,0.16); }
.bc__pip--ct { background: var(--ct); }
.bc__pip--now { background: #fff; }

/* ---- rundown: the series, and the pool behind it ---- */
.bc__rundown { display: flex; align-items: stretch; border-bottom: 1px solid var(--line); background: rgba(0,0,0,0.3); }
.bc__rdLabel {
  padding: 12px 16px; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase;
  color: rgba(255,255,255,0.35); display: flex; align-items: center;
  border-right: 1px solid var(--line); white-space: nowrap;
}
.bc__rdMaps { display: flex; flex: 1; overflow-x: auto; }
.bc__rd {
  position: relative; flex: 1 0 150px; min-height: 62px; padding: 10px 14px;
  border-right: 1px solid var(--line); background: transparent; cursor: pointer;
  color: #fff; text-align: left; display: flex; flex-direction: column; justify-content: center; gap: 3px;
  overflow: hidden;
}
.bc__rdArt { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: 0.22; }
.bc__rd:hover .bc__rdArt { opacity: 0.4; }
.bc__rdName { position: relative; font-size: 14px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
.bc__rdNote { position: relative; font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.45); }
.bc__rd--live { box-shadow: inset 3px 0 0 var(--live); }
.bc__rd--live .bc__rdNote { color: var(--live); }
.bc__rd--done .bc__rdName { color: rgba(255,255,255,0.55); }
.bc__rd--staged { box-shadow: inset 3px 0 0 var(--take); }
.bc__rd--staged .bc__rdNote { color: var(--take); }
.bc__poolBtn {
  padding: 0 18px; background: transparent; border: 0; border-left: 1px solid var(--line);
  color: rgba(255,255,255,0.5); font: inherit; font-size: 10px; letter-spacing: 0.18em;
  text-transform: uppercase; cursor: pointer; white-space: nowrap;
}
.bc__poolBtn:hover { color: #fff; background: rgba(255,255,255,0.06); }

.bc__pool { display: flex; flex-wrap: wrap; border-bottom: 1px solid var(--line); background: rgba(0,0,0,0.45); }
.bc__poolMap {
  position: relative; flex: 1 1 120px; min-height: 66px; padding: 10px 12px;
  border-right: 1px solid var(--line); background: transparent; cursor: pointer;
  color: #fff; text-align: left; overflow: hidden;
  display: flex; flex-direction: column; justify-content: flex-end; gap: 2px;
}
.bc__poolMap:hover .bc__rdArt { opacity: 0.45; }
.bc__poolMap--banned .bc__rdName { color: rgba(255,255,255,0.4); text-decoration: line-through; }
.bc__poolMap--banned .bc__rdArt { filter: grayscale(1); opacity: 0.1; }

/* ---- rosters, with the draft folded in ---- */
.bc__grid { display: grid; grid-template-columns: 1fr auto 1fr; flex: 1; min-height: 0; }
.bc__grid--simple { grid-template-columns: 1fr; }
.bc__col { padding: 14px 16px 20px; min-width: 0; }
.bc__col + .bc__col { border-left: 1px solid var(--line); }
.bc__head {
  display: grid; grid-template-columns: 1fr repeat(4, 46px) 62px;
  gap: 8px; padding: 0 10px 8px;
  font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(255,255,255,0.35); font-weight: 600;
}
.bc__head span:not(:first-child) { text-align: right; }
.bc__row {
  display: grid; grid-template-columns: 1fr repeat(4, 46px) 62px;
  gap: 8px; align-items: center; padding: var(--rowPad) 10px; position: relative;
  font-variant-numeric: tabular-nums; border-top: 1px solid rgba(255,255,255,0.05);
}
.bc__row span:not(.bc__who):not(.bc__bar) { text-align: right; }
.bc__bar { position: absolute; inset: 0 auto 0 0; opacity: var(--barOpacity); pointer-events: none; }
.bc__ctcol .bc__bar { background: linear-gradient(90deg, var(--ct), transparent); }
.bc__tcol .bc__bar { background: linear-gradient(90deg, var(--t), transparent); }
.bc__who { display: flex; align-items: center; gap: 9px; min-width: 0; position: relative; }
.bc__player { font-weight: 700; font-size: 15px; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bc__c { font-size: 9px; font-weight: 800; letter-spacing: 0.1em; padding: 2px 4px; background: rgba(255,255,255,0.14); }
.bc__num { font-size: 14px; font-weight: 600; position: relative; }
.bc__num--dim { color: rgba(255,255,255,0.4); font-weight: 500; }

/* the draft control: hidden until the row is under the cursor, so a scoreboard
   stays a scoreboard right up to the moment you decide to change it */
.bc__moves { display: flex; gap: 4px; justify-content: flex-end; position: relative; opacity: 0; }
.bc__row:hover .bc__moves, .bc__row:focus-within .bc__moves { opacity: 1; }
.bc__move {
  background: rgba(255,255,255,0.08); border: 0; cursor: pointer; color: #fff;
  font: inherit; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; padding: 3px 6px;
}
.bc__move:hover { background: #fff; color: #06070a; }
.bc__row--moved { box-shadow: inset 3px 0 0 var(--take); }
.bc__row--moved .bc__player { color: var(--take); }

.bc__standby {
  width: 214px; border-left: 1px solid var(--line); border-right: 1px solid var(--line);
  padding: 14px 12px; background: rgba(0,0,0,0.25);
}
.bc__sbHead {
  font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(255,255,255,0.35); font-weight: 600; padding: 0 4px 10px;
}
.bc__sbRow { display: flex; align-items: center; gap: 8px; padding: 8px 4px; border-top: 1px solid rgba(255,255,255,0.05); }
.bc__sbName { font-size: 14px; font-weight: 700; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bc__sbEmpty { padding: 10px 4px; font-size: 12px; color: rgba(255,255,255,0.3); line-height: 1.5; }

/* ---- gallery ---- */
.bc__strip { position: relative; display: flex; align-items: stretch; flex-wrap: wrap; border-top: 1px solid var(--line); background: rgba(0,0,0,0.5); }
.bc__btn {
  flex: 1 1 132px; min-height: 62px; padding: 12px 16px;
  display: flex; flex-direction: column; justify-content: center; gap: 3px;
  background: transparent; border: 0; border-right: 1px solid var(--line);
  color: #fff; text-align: left; cursor: pointer; transition: background 120ms;
}
.bc__btn:hover { background: rgba(255,255,255,0.07); }
.bc__btn:last-child { border-right: 0; }
.bc__btnLabel { font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.bc__btnHint { font-size: 11px; color: rgba(255,255,255,0.42); }
.bc__btn--danger .bc__btnLabel { color: #ff5a5a; }
.bc__meta {
  flex: 2 1 240px; min-height: 62px; padding: 12px 18px;
  display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
  font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.42);
  border-right: 1px solid var(--line);
}
.bc__meta b { color: #fff; font-weight: 700; letter-spacing: 0.04em; }

/* ---- the take bar ---- */
.bc__take {
  position: sticky; bottom: 0; z-index: 5; display: flex; align-items: stretch; flex-wrap: wrap;
  border-top: 2px solid var(--take); background: #0b0c10;
}
.bc__takeList {
  flex: 1 1 320px; padding: 11px 18px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.45);
}
.bc__takeCount { color: var(--take); font-weight: 800; letter-spacing: 0.16em; }
.bc__chip {
  padding: 3px 8px; border: 1px solid rgba(255,255,255,0.14); color: #fff;
  font-weight: 600; letter-spacing: 0.06em; white-space: nowrap;
}
.bc__chip em { font-style: normal; color: var(--take); }
.bc__clear {
  padding: 0 22px; background: transparent; border: 0; border-left: 1px solid var(--line);
  color: rgba(255,255,255,0.5); font: inherit; font-size: 12px; letter-spacing: 0.16em;
  text-transform: uppercase; cursor: pointer;
}
.bc__clear:hover { color: #fff; }
.bc__takeBtn {
  padding: 0 40px; min-height: 56px; background: var(--take); border: 0; cursor: pointer;
  color: #08090c; font: inherit; font-size: 16px; font-weight: 800; letter-spacing: 0.2em;
  text-transform: uppercase;
}
.bc__takeBtn:hover { filter: brightness(1.12); }

@media (max-width: 980px) {
  .bc__band { grid-template-columns: 1fr; }
  .bc__centre { border-left: 0; border-right: 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); order: -1; }
  .bc__side { padding: 16px 20px; }
  .bc__grid, .bc__grid--simple { grid-template-columns: 1fr; }
  .bc__col + .bc__col { border-left: 0; border-top: 1px solid var(--line); }
  .bc__standby { width: auto; border-left: 0; border-right: 0; border-top: 1px solid var(--line); }
  .bc__head, .bc__row { grid-template-columns: 1fr repeat(4, 38px) 56px; }
  .bc__moves { opacity: 1; }
  .bc__formats--rail { margin-left: 0; }
  .bc__takeBtn { flex: 1; padding: 16px; }
}
`;

type Side = "ct" | "t" | "standby";

/** PROGRAM: what the server is actually running. Preview edits are diffed against it. */
const PROGRAM = {
  preset: "competitive",
  map: MATCH.map,
  mapLabel: MATCH.mapLabel,
  format: MATCH.series.format,
  overtime: MATCH.overtime,
  ctName: MATCH.ct.name,
  tName: MATCH.t.name,
  sides: Object.fromEntries([
    ...PLAYERS.map((p) => [p.id, p.side as Side]),
    ...STANDBY.map((p) => [p.id, "standby" as Side]),
  ]) as Record<string, Side>,
};

const ALL_PLAYERS: MockPlayer[] = [...PLAYERS, ...STANDBY];
const FORMATS = ["BO1", "BO3", "BO5"];

export default function BroadcastDirection() {
  const [preview, setPreview] = useState(PROGRAM);
  const [poolOpen, setPoolOpen] = useState(false);

  const dial = useDialKit(
    "Broadcast",
    {
      stage: {
        artOpacity: [0.28, 0, 1],
        veil: [0.92, 0.4, 1],
        bandPad: [26, 8, 64],
      },
      type: {
        scoreSize: [11, 4, 16],
        teamSize: [28, 14, 48],
      },
      colour: {
        ct: "#3d8bfd",
        t: "#ff9422",
        live: "#ff4d4d",
        take: "#ffd166",
      },
      rows: {
        rowPad: [11, 2, 24],
        barOpacity: [0.13, 0, 0.6],
      },
    },
    { id: "broadcast-direction", persist: true },
  );

  const move = (id: string, to: Side) =>
    setPreview((p) => ({ ...p, sides: { ...p.sides, [id]: to } }));

  const pickMap = (name: string, label: string) =>
    setPreview((p) => ({ ...p, map: name, mapLabel: label }));

  /**
   * The staged diff, in the words the chips use. Deriving it from the two
   * objects rather than tracking a dirty flag per control is what stops the take
   * bar claiming a change that is not there, or missing one that is.
   */
  const changes = useMemo(() => {
    const out: { key: string; label: string; to: string }[] = [];
    if (preview.preset !== PROGRAM.preset) {
      const p = PRESETS.find((x) => x.id === preview.preset);
      out.push({ key: "preset", label: "Mode", to: p?.label ?? preview.preset });
    }
    if (preview.map !== PROGRAM.map) out.push({ key: "map", label: "Map", to: preview.mapLabel });
    if (preview.format !== PROGRAM.format) out.push({ key: "format", label: "Series", to: preview.format });
    if (preview.overtime !== PROGRAM.overtime)
      out.push({ key: "ot", label: "Overtime", to: preview.overtime ? "on" : "off" });
    if (preview.ctName !== PROGRAM.ctName) out.push({ key: "ctName", label: "CT name", to: preview.ctName });
    if (preview.tName !== PROGRAM.tName) out.push({ key: "tName", label: "T name", to: preview.tName });
    const moved = ALL_PLAYERS.filter((p) => preview.sides[p.id] !== PROGRAM.sides[p.id]);
    if (moved.length)
      out.push({ key: "roster", label: "Roster", to: `${moved.length} move${moved.length === 1 ? "" : "s"}` });
    return out;
  }, [preview]);

  const dirty = changes.length > 0;
  const competitive = preview.preset === "competitive";
  const rosterOf = (side: Side) => ALL_PLAYERS.filter((p) => preview.sides[p.id] === side);
  const ct = rosterOf("ct");
  const t = rosterOf("t");
  const standby = rosterOf("standby");

  const vars = {
    "--ct": dial.colour.ct,
    "--t": dial.colour.t,
    "--live": dial.colour.live,
    "--take": dial.colour.take,
    "--veil": String(dial.stage.veil),
    "--bandPad": `${dial.stage.bandPad}px`,
    "--teamSize": String(dial.type.teamSize),
    "--scoreSize": String(dial.type.scoreSize),
    "--rowPad": `${dial.rows.rowPad}px`,
    "--barOpacity": String(dial.rows.barOpacity),
  } as React.CSSProperties;

  function Row({ p, side }: { p: MockPlayer; side: Side }) {
    const moved = preview.sides[p.id] !== PROGRAM.sides[p.id];
    return (
      <div className={`bc__row${moved ? " bc__row--moved" : ""}`}>
        <span className="bc__bar" style={{ width: `${Math.min(100, p.adr)}%` }} aria-hidden />
        <span className="bc__who">
          <span className="bc__player">{p.name}</span>
          {p.captain && <span className="bc__c">C</span>}
        </span>
        <span className="bc__num">{p.kills}</span>
        <span className="bc__num bc__num--dim">{p.deaths}</span>
        <span className="bc__num">{kd(p)}</span>
        <span className="bc__num bc__num--dim">{p.adr}</span>
        <span className="bc__moves">
          <button className="bc__move" type="button" onClick={() => move(p.id, "standby")} title="Bench">
            ·
          </button>
          <button
            className="bc__move"
            type="button"
            onClick={() => move(p.id, side === "ct" ? "t" : "ct")}
            title={side === "ct" ? "Move to Terrorists" : "Move to Counter-Terrorists"}
          >
            {side === "ct" ? "T ▸" : "◂ CT"}
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="bc" style={vars}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <DialRoot productionEnabled position="top-right" defaultOpen={false} theme="dark" />

      <div
        className="bc__art"
        style={{ backgroundImage: `url(${mapArt(preview.map)})`, opacity: dial.stage.artOpacity }}
        aria-hidden
      />
      <div className="bc__veil" aria-hidden />

      <div className="bc__body">
        {/*
          The bus indicator is the whole contract of this screen in one chip:
          while it says ON AIR, nothing you have touched has reached the server.
        */}
        <div className="bc__rail">
          <span className={`bc__bus${dirty ? " bc__bus--pvw" : ""}`}>{dirty ? "Preview" : "On air"}</span>
          <span>
            <b>{SERVER.hostname}</b> · {SERVER.slotsUsed}/{SERVER.slotsTotal}
          </span>
          <span className="bc__rec">● Rec</span>
          <span>
            <b>
              {SERVER.ip}:{SERVER.port}
            </b>
          </span>
          <div className="bc__formats bc__formats--rail">
            {PRESETS.map((p) => {
              const on = preview.preset === p.id;
              const staged = on && p.id !== PROGRAM.preset;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`bc__format${on ? (staged ? " bc__format--staged" : " bc__format--on") : ""}`}
                  onClick={() => setPreview((v) => ({ ...v, preset: p.id }))}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="bc__band">
          <div className="bc__side bc__ct">
            <span className="bc__sideMark" aria-hidden />
            <span className="bc__team">
              <span className="bc__tag">Counter-Terrorists · {ct.length}</span>
              <input
                className={`bc__nameField${preview.ctName !== PROGRAM.ctName ? " bc__nameField--staged" : ""}`}
                value={preview.ctName}
                onChange={(e) => setPreview((v) => ({ ...v, ctName: e.target.value }))}
                aria-label="Counter-Terrorist team name"
                spellCheck={false}
              />
            </span>
            <span className="bc__score">{MATCH.ct.score}</span>
          </div>

          <div className="bc__centre">
            <span className="bc__live">
              <span className="bc__dot" aria-hidden />
              {dirty ? "Live · staged" : "Live"}
            </span>
            <button
              type="button"
              className={`bc__mapBtn${preview.map !== PROGRAM.map ? " bc__mapBtn--staged" : ""}`}
              onClick={() => setPoolOpen((v) => !v)}
            >
              {preview.mapLabel}
              <span className="bc__caret" aria-hidden>
                ▾
              </span>
            </button>
            <span className="bc__round">
              Round {MATCH.round} of {MATCH.maxRounds}
            </span>
            {competitive && (
              <>
                <span className="bc__pips" aria-label={`${preview.format}, map ${MATCH.series.mapIndex}`}>
                  {Array.from({ length: Number(preview.format.slice(2)) }).map((_, i) => (
                    <span key={i} className={`bc__pip ${i === 0 ? "bc__pip--ct" : i === 1 ? "bc__pip--now" : ""}`} />
                  ))}
                </span>
                <div className="bc__formats">
                  {FORMATS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`bc__format${
                        preview.format === f
                          ? f === PROGRAM.format
                            ? " bc__format--on"
                            : " bc__format--staged"
                          : ""
                      }`}
                      onClick={() => setPreview((v) => ({ ...v, format: f }))}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button
              type="button"
              className={`bc__ot${preview.overtime ? " bc__ot--on" : ""}${
                preview.overtime !== PROGRAM.overtime ? " bc__ot--staged" : ""
              }`}
              onClick={() => setPreview((v) => ({ ...v, overtime: !v.overtime }))}
            >
              Overtime {preview.overtime ? "on" : "off"}
            </button>
          </div>

          <div className="bc__side bc__side--t bc__t">
            <span className="bc__sideMark" aria-hidden />
            <span className="bc__team">
              <span className="bc__tag">Terrorists · {t.length}</span>
              <input
                className={`bc__nameField${preview.tName !== PROGRAM.tName ? " bc__nameField--staged" : ""}`}
                value={preview.tName}
                onChange={(e) => setPreview((v) => ({ ...v, tName: e.target.value }))}
                aria-label="Terrorist team name"
                spellCheck={false}
              />
            </span>
            <span className="bc__score">{MATCH.t.score}</span>
          </div>
        </div>

        {/*
          The rundown is the veto result shown the way a gallery shows a running
          order: what aired, what is on air, what is cued. Opening the pool turns
          the same strip into the veto board — one object in two states, rather
          than a separate Map Veto page you have to go and find.
        */}
        {competitive && (
          <div className="bc__rundown">
            <span className="bc__rdLabel">Rundown · {preview.format}</span>
            <div className="bc__rdMaps">
              {SERIES_MAPS.map((m) => {
                const staged = preview.map === m.name && m.name !== PROGRAM.map;
                return (
                  <button
                    key={m.name}
                    type="button"
                    className={`bc__rd bc__rd--${m.state}${staged ? " bc__rd--staged" : ""}`}
                    onClick={() => pickMap(m.name, m.label)}
                  >
                    <span className="bc__rdArt" style={{ backgroundImage: `url(${mapArt(m.name)})` }} aria-hidden />
                    <span className="bc__rdName">{m.label}</span>
                    <span className="bc__rdNote">{staged ? "Cue to air" : m.note}</span>
                  </button>
                );
              })}
            </div>
            <button className="bc__poolBtn" type="button" onClick={() => setPoolOpen((v) => !v)}>
              {poolOpen ? "Hide pool" : "Re-veto"}
            </button>
          </div>
        )}

        {poolOpen && (
          <div className="bc__pool">
            {MAP_POOL.map((m) => (
              <button
                key={m.name}
                type="button"
                className={`bc__poolMap${m.state === "banned" ? " bc__poolMap--banned" : ""}`}
                onClick={() => pickMap(m.name, m.label)}
              >
                <span className="bc__rdArt" style={{ backgroundImage: `url(${mapArt(m.name)})` }} aria-hidden />
                <span className="bc__rdName">{m.label}</span>
                <span className="bc__rdNote">
                  {m.state === "banned" ? `Ban · ${m.by}` : m.state === "decider" ? "Decider" : `Pick · ${m.by}`}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className={`bc__grid${competitive ? "" : " bc__grid--simple"}`}>
          <div className="bc__col bc__ctcol">
            <div className="bc__head">
              <span>{preview.ctName}</span>
              <span>K</span>
              <span>D</span>
              <span>K/D</span>
              <span>ADR</span>
              <span />
            </div>
            {ct.map((p) => (
              <Row key={p.id} p={p} side="ct" />
            ))}
          </div>

          {/*
            Standby is where the draft happens, and it only exists in
            Competitive: an AWP map for whoever turns up has no captains and no
            bench, and the brief was explicit that anything but Competitive
            should get simpler rather than the same screen with fields greyed.
          */}
          {competitive && (
            <div className="bc__standby">
              <div className="bc__sbHead">Standby · {standby.length}</div>
              {standby.length === 0 && (
                <p className="bc__sbEmpty">
                  Everyone connected is on a side. Bench someone with the · button on their row.
                </p>
              )}
              {standby.map((p) => (
                <div key={p.id} className="bc__sbRow">
                  <button className="bc__move" type="button" onClick={() => move(p.id, "ct")}>
                    ◂ CT
                  </button>
                  <span className="bc__sbName">{p.name}</span>
                  <button className="bc__move" type="button" onClick={() => move(p.id, "t")}>
                    T ▸
                  </button>
                </div>
              ))}
            </div>
          )}

          {competitive && (
            <div className="bc__col bc__tcol">
              <div className="bc__head">
                <span>{preview.tName}</span>
                <span>K</span>
                <span>D</span>
                <span>K/D</span>
                <span>ADR</span>
                <span />
              </div>
              {t.map((p) => (
                <Row key={p.id} p={p} side="t" />
              ))}
            </div>
          )}
        </div>

        <div className="bc__strip">
          <div className="bc__meta">
            <span>
              Demo <b>{MATCH.recording.slice(0, 19)}</b>
            </span>
            <span>
              Tick <b>{SERVER.tickrate}</b>
            </span>
          </div>
          <button className="bc__btn" type="button">
            <span className="bc__btnLabel">Pause</span>
            <span className="bc__btnHint">At the next freeze</span>
          </button>
          <button className="bc__btn" type="button">
            <span className="bc__btnLabel">Swap</span>
            <span className="bc__btnHint">Sides, now</span>
          </button>
          <button className="bc__btn" type="button">
            <span className="bc__btnLabel">Knife</span>
            <span className="bc__btnHint">Restarts the map</span>
          </button>
          <button className="bc__btn" type="button">
            <span className="bc__btnLabel">Backup</span>
            <span className="bc__btnHint">Round 11</span>
          </button>
          <button className="bc__btn bc__btn--danger" type="button">
            <span className="bc__btnLabel">End match</span>
            <span className="bc__btnHint">Drops the series</span>
          </button>
        </div>

        {/*
          The take bar is the only thing on the page that talks to the server. It
          says exactly what it is about to do and it does all of it in one cut —
          which is the entire reason the edits above are inline.
        */}
        {dirty && (
          <div className="bc__take">
            <div className="bc__takeList">
              <span className="bc__takeCount">{changes.length} staged</span>
              {changes.map((c) => (
                <span key={c.key} className="bc__chip">
                  {c.label} <em>{c.to}</em>
                </span>
              ))}
            </div>
            <button className="bc__clear" type="button" onClick={() => setPreview(PROGRAM)}>
              Clear
            </button>
            <button className="bc__takeBtn" type="button" onClick={() => setPreview(PROGRAM)}>
              Take
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
