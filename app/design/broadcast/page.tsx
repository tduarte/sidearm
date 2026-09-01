"use client";

/**
 * Direction 1 — BROADCAST, third pass.
 *
 * There is no setup screen: the scoreboard *is* the form. Team names, captains,
 * the map, the series format, overtime and who is on which side are edited in
 * place, at the size they are displayed.
 *
 * Batching borrows the idiom the direction was already using. A gallery has two
 * buses — PROGRAM is on air, PREVIEW is what you are building. Edits land in
 * preview and change nothing; the dock names exactly what is staged; applying
 * cuts all of it to air at once. That one model covers save-versus-discard, the
 * blast radius, and the fact that a live match is something you interrupt
 * rather than a form you submit.
 *
 * ---
 *
 * MOTION THESIS (this surface is Operate, so motion serves feedback and state,
 * never decoration, and routine transitions stay under 150ms):
 *
 * - Focal moment: the cut. Applying is the one authored sequence — a fast wipe
 *   crosses the band, the staged amber drops out of every field at once, and the
 *   bus chip flips PREVIEW → ON AIR. It is 260ms and it happens once per apply,
 *   because that is the moment the server actually changed.
 * - Continuity: the dock is one object that grows an apply section rather than a
 *   second bar appearing; the pool expands from the rundown it replaces.
 * - Feedback: every control has hover, :active depression, and a focus-visible
 *   ring. Nothing here relies on hover alone to announce that it is a control —
 *   that was the previous pass's mistake, and it read as decoration.
 * - Budget: transform and opacity only, one wipe element, no persistent loops
 *   beyond the single live dot. All of it is off under prefers-reduced-motion.
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
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  min-height: calc(100svh - 32px);
  background: var(--stage);
  color: #fff;
  font-family: var(--font-geist-sans), system-ui, sans-serif;
  display: flex; flex-direction: column; position: relative; overflow: hidden;
  padding-bottom: 132px;
}
.bc__art {
  position: absolute; inset: 0; background-size: cover; background-position: center 35%;
  filter: saturate(0.5) contrast(1.1);
  transition: opacity 240ms var(--ease);
}
.bc__veil {
  position: absolute; inset: 0;
  background:
    radial-gradient(120% 80% at 50% 0%, rgba(0,0,0,0.15), rgba(6,7,10,var(--veil)) 70%),
    linear-gradient(180deg, rgba(6,7,10,0.4) 0%, rgba(6,7,10,0.98) 62%);
}
.bc__body { position: relative; display: flex; flex-direction: column; flex: 1; min-height: 0; }

/* every control on this page shares one focus treatment, so the keyboard path
   is never the one that got forgotten */
.bc button:focus-visible, .bc input:focus-visible {
  outline: 2px solid var(--take); outline-offset: 2px;
}

/* ---- top rail ---- */
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
  transition: background 180ms var(--ease), color 180ms var(--ease);
}
.bc__bus--pvw { background: var(--take); box-shadow: 0 0 22px -4px var(--take); color: #0a0a0a; }
.bc__rail b { color: #fff; font-weight: 700; letter-spacing: 0.06em; }
.bc__rec { color: var(--live); }
.bc__railLabel { margin-left: auto; }

/* segmented control: a real one, with a surface, a hover state and a press */
.bc__seg { display: flex; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.04); }
.bc__segBtn {
  position: relative; background: transparent; border: 0; cursor: pointer;
  padding: 7px 13px; font: inherit; font-size: 11px; letter-spacing: 0.12em;
  text-transform: uppercase; color: rgba(255,255,255,0.62);
  border-right: 1px solid rgba(255,255,255,0.12);
  transition: background 120ms var(--ease), color 120ms var(--ease), transform 90ms var(--ease);
}
.bc__segBtn:last-child { border-right: 0; }
.bc__segBtn::after {
  content: ""; position: absolute; left: 50%; right: 50%; bottom: 0; height: 2px;
  background: #fff; transition: left 140ms var(--ease), right 140ms var(--ease);
}
.bc__segBtn:hover { background: rgba(255,255,255,0.1); color: #fff; }
.bc__segBtn:hover::after { left: 18%; right: 18%; }
.bc__segBtn:active { transform: translateY(1px); }
.bc__segBtn--on { background: #fff; color: #06070a; font-weight: 800; }
.bc__segBtn--on::after { left: 0; right: 0; background: transparent; }
.bc__segBtn--staged { background: var(--take); color: #0a0a0a; font-weight: 800; }
.bc__segBtn--staged::after { left: 0; right: 0; background: transparent; }

/* ---- the band ---- */
.bc__band { display: grid; grid-template-columns: 1fr auto 1fr; border-bottom: 1px solid var(--line); position: relative; }
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
.bc__capName { color: rgba(255,255,255,0.5); }

/* an editable field, and it says so: a dashed rule that solidifies on hover.
   The previous pass hid this until hover and the field read as a label. */
.bc__nameWrap { display: flex; align-items: center; gap: 8px; width: 100%; }
.bc__side--t .bc__nameWrap { flex-direction: row-reverse; }
.bc__nameField {
  font: inherit; color: #fff; background: transparent; flex: 1; min-width: 0;
  border: 0; border-bottom: 1px dashed rgba(255,255,255,0.22);
  padding: 2px 2px 3px;
  font-size: calc(var(--teamSize) * 1px); font-weight: 800;
  letter-spacing: -0.02em; text-transform: uppercase; line-height: 1.05;
  transition: border-color 120ms var(--ease), color 120ms var(--ease);
  cursor: text;
}
.bc__side--t .bc__nameField { text-align: right; }
.bc__nameField:hover { border-bottom-color: rgba(255,255,255,0.6); }
.bc__nameField:focus { outline: none; border-bottom: 1px solid var(--take); }
.bc__nameField--staged { border-bottom: 1px solid var(--take); color: var(--take); }
.bc__pencil { font-size: 13px; color: rgba(255,255,255,0.3); flex: 0 0 auto; }

.bc__score {
  font-size: clamp(48px, calc(var(--scoreSize) * 1vw), 132px);
  font-weight: 800; line-height: 0.8; letter-spacing: -0.05em;
  font-variant-numeric: tabular-nums;
}

.bc__centre {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 22px; min-width: 260px;
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

/* the map is a control shaped like a control: surface, caret, press */
.bc__mapBtn {
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.16);
  cursor: pointer; color: #fff; font: inherit;
  font-size: clamp(20px, 2.6vw, 34px); font-weight: 800;
  letter-spacing: -0.02em; text-transform: uppercase; padding: 6px 14px;
  display: inline-flex; align-items: center; gap: 11px;
  transition: background 120ms var(--ease), border-color 120ms var(--ease), transform 90ms var(--ease);
}
.bc__mapBtn:hover { background: rgba(255,255,255,0.13); border-color: rgba(255,255,255,0.4); }
.bc__mapBtn:active { transform: translateY(1px); }
.bc__mapBtn--staged { border-color: var(--take); color: var(--take); }
.bc__caret { font-size: 13px; opacity: 0.6; transition: transform 160ms var(--ease); }
.bc__caret--open { transform: rotate(180deg); }
.bc__round { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255,255,255,0.5); font-variant-numeric: tabular-nums; }

/* a switch, not a word that happens to be clickable */
.bc__switch {
  display: inline-flex; align-items: center; gap: 9px; cursor: pointer;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.16);
  padding: 5px 11px 5px 7px; font: inherit;
  font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
  color: rgba(255,255,255,0.6);
  transition: background 120ms var(--ease), color 120ms var(--ease), border-color 120ms var(--ease), transform 90ms var(--ease);
}
.bc__switch:hover { background: rgba(255,255,255,0.11); color: #fff; }
.bc__switch:active { transform: translateY(1px); }
.bc__track {
  width: 26px; height: 14px; border-radius: 99px; background: rgba(255,255,255,0.18);
  position: relative; flex: 0 0 auto; transition: background 160ms var(--ease);
}
.bc__knob {
  position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; border-radius: 99px;
  background: #fff; transition: transform 160ms var(--ease);
}
.bc__switch--on { color: #fff; border-color: rgba(255,255,255,0.4); }
.bc__switch--on .bc__track { background: rgba(255,255,255,0.55); }
.bc__switch--on .bc__knob { transform: translateX(12px); }
.bc__switch--staged { border-color: var(--take); color: var(--take); }
.bc__switch--staged .bc__track { background: var(--take); }

.bc__pips { display: flex; gap: 5px; }
.bc__pip { width: 26px; height: 4px; background: rgba(255,255,255,0.16); transition: background 160ms var(--ease); }
.bc__pip--ct { background: var(--ct); }
.bc__pip--now { background: #fff; }

/* the cut: the one authored moment, fired when preview goes to air */
.bc__cut {
  position: absolute; inset: 0; pointer-events: none; z-index: 4;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent);
  animation: bccut 260ms var(--ease) forwards;
}
@keyframes bccut {
  from { transform: translateX(-100%); opacity: 0.9; }
  to { transform: translateX(100%); opacity: 0; }
}

/* ---- rundown and pool ---- */
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
  overflow: hidden; transition: transform 120ms var(--ease);
}
.bc__rdArt { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: 0.22; transition: opacity 160ms var(--ease); }
.bc__rd:hover .bc__rdArt, .bc__poolMap:hover .bc__rdArt { opacity: 0.45; }
.bc__rd:active { transform: translateY(1px); }
.bc__rdName { position: relative; font-size: 14px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
.bc__rdNote { position: relative; font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.45); }
.bc__rd--live { box-shadow: inset 3px 0 0 var(--live); }
.bc__rd--live .bc__rdNote { color: var(--live); }
.bc__rd--done .bc__rdName { color: rgba(255,255,255,0.55); }
.bc__rd--staged { box-shadow: inset 3px 0 0 var(--take); }
.bc__rd--staged .bc__rdNote { color: var(--take); }
.bc__poolBtn {
  padding: 0 18px; background: rgba(255,255,255,0.05); border: 0; border-left: 1px solid var(--line);
  color: rgba(255,255,255,0.7); font: inherit; font-size: 10px; letter-spacing: 0.18em;
  text-transform: uppercase; cursor: pointer; white-space: nowrap;
  display: inline-flex; align-items: center; gap: 8px;
  transition: background 120ms var(--ease), color 120ms var(--ease);
}
.bc__poolBtn:hover { color: #fff; background: rgba(255,255,255,0.12); }

.bc__pool {
  display: flex; flex-wrap: wrap; border-bottom: 1px solid var(--line); background: rgba(0,0,0,0.45);
  animation: bcdrop 200ms var(--ease);
}
@keyframes bcdrop { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
.bc__poolMap {
  position: relative; flex: 1 1 120px; min-height: 66px; padding: 10px 12px;
  border-right: 1px solid var(--line); background: transparent; cursor: pointer;
  color: #fff; text-align: left; overflow: hidden;
  display: flex; flex-direction: column; justify-content: flex-end; gap: 2px;
  transition: transform 120ms var(--ease);
}
.bc__poolMap:active { transform: translateY(1px); }
.bc__poolMap--banned .bc__rdName { color: rgba(255,255,255,0.4); text-decoration: line-through; }
.bc__poolMap--banned .bc__rdArt { filter: grayscale(1); opacity: 0.1; }

/* ---- rosters ---- */
.bc__grid { display: grid; grid-template-columns: 1fr auto 1fr; flex: 1; min-height: 0; }
.bc__grid--simple { grid-template-columns: 1fr; }
.bc__col { padding: 14px 16px 20px; min-width: 0; }
.bc__col + .bc__col { border-left: 1px solid var(--line); }
.bc__head {
  display: grid; grid-template-columns: 1fr repeat(4, 46px) 96px;
  gap: 8px; padding: 0 10px 8px;
  font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(255,255,255,0.35); font-weight: 600;
}
.bc__head span:not(:first-child) { text-align: right; }
.bc__row {
  display: grid; grid-template-columns: 1fr repeat(4, 46px) 96px;
  gap: 8px; align-items: center; padding: var(--rowPad) 10px; position: relative;
  font-variant-numeric: tabular-nums; border-top: 1px solid rgba(255,255,255,0.05);
  transition: background 120ms var(--ease);
}
.bc__row:hover { background: rgba(255,255,255,0.04); }
.bc__row span:not(.bc__who):not(.bc__bar) { text-align: right; }
.bc__bar { position: absolute; inset: 0 auto 0 0; opacity: var(--barOpacity); pointer-events: none; }
.bc__ctcol .bc__bar { background: linear-gradient(90deg, var(--ct), transparent); }
.bc__tcol .bc__bar { background: linear-gradient(90deg, var(--t), transparent); }
.bc__who { display: flex; align-items: center; gap: 9px; min-width: 0; position: relative; }
.bc__player { font-weight: 700; font-size: 15px; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bc__num { font-size: 14px; font-weight: 600; position: relative; }
.bc__num--dim { color: rgba(255,255,255,0.4); font-weight: 500; }

/* captaincy is a control: exactly one per side, click a badge to move it */
.bc__cap {
  font-size: 9px; font-weight: 800; letter-spacing: 0.1em; padding: 3px 5px;
  background: transparent; border: 1px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.42);
  cursor: pointer; flex: 0 0 auto; font-family: inherit;
  transition: background 120ms var(--ease), color 120ms var(--ease), border-color 120ms var(--ease);
}
.bc__cap:hover { border-color: #fff; color: #fff; }
.bc__cap--on { background: #fff; color: #06070a; border-color: #fff; }
.bc__cap--staged { background: var(--take); border-color: var(--take); color: #0a0a0a; }

/* move controls stay faintly visible so a row announces it is interactive,
   and come to full strength under the cursor */
.bc__moves { display: flex; gap: 4px; justify-content: flex-end; position: relative; opacity: 0.32; transition: opacity 120ms var(--ease); }
.bc__row:hover .bc__moves, .bc__row:focus-within .bc__moves, .bc__sbRow .bc__moves { opacity: 1; }
.bc__move {
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.14); cursor: pointer; color: #fff;
  font: inherit; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; padding: 4px 7px;
  transition: background 120ms var(--ease), color 120ms var(--ease), transform 90ms var(--ease);
}
.bc__move:hover { background: #fff; color: #06070a; border-color: #fff; }
.bc__move:active { transform: translateY(1px); }
.bc__row--moved { box-shadow: inset 3px 0 0 var(--take); }
.bc__row--moved .bc__player { color: var(--take); }

.bc__standby {
  width: 230px; border-left: 1px solid var(--line); border-right: 1px solid var(--line);
  padding: 14px 12px; background: rgba(0,0,0,0.25);
}
.bc__sbHead {
  font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(255,255,255,0.35); font-weight: 600; padding: 0 4px 10px;
}
.bc__sbRow { display: flex; align-items: center; gap: 8px; padding: 8px 4px; border-top: 1px solid rgba(255,255,255,0.05); }
.bc__sbName { font-size: 14px; font-weight: 700; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bc__sbEmpty { padding: 10px 4px; font-size: 12px; color: rgba(255,255,255,0.3); line-height: 1.5; }

/* ---- the dock ---- */
.bc__dock {
  position: fixed; left: 50%; bottom: 20px; z-index: 30;
  transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: stretch; gap: 8px;
  max-width: min(1120px, calc(100vw - 32px));
}
.bc__dockChips {
  display: flex; align-items: center; gap: 7px; flex-wrap: wrap; justify-content: center;
  animation: bcrise 220ms var(--ease);
}
@keyframes bcrise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.bc__chip {
  padding: 4px 9px; font-size: 11px; letter-spacing: 0.06em;
  background: rgba(12,14,19,0.92); border: 1px solid rgba(255,255,255,0.16); color: #fff;
  font-weight: 600; white-space: nowrap; backdrop-filter: blur(12px);
}
.bc__chip em { font-style: normal; color: var(--take); }

.bc__dockBar {
  display: flex; align-items: stretch; gap: 5px; padding: 6px;
  background: rgba(12,14,19,0.86); backdrop-filter: blur(20px) saturate(1.3);
  border: 1px solid rgba(255,255,255,0.16); border-radius: 15px;
  box-shadow: 0 22px 60px -22px rgba(0,0,0,0.95), 0 1px 0 rgba(255,255,255,0.07) inset;
  overflow-x: auto;
}
.bc__act {
  display: flex; align-items: center; gap: 9px; padding: 11px 15px; border-radius: 10px;
  background: transparent; border: 0; cursor: pointer; color: #fff; font: inherit;
  white-space: nowrap;
  transition: background 120ms var(--ease), transform 90ms var(--ease), color 120ms var(--ease);
}
.bc__act:hover { background: rgba(255,255,255,0.12); }
.bc__act:active { transform: translateY(1px) scale(0.985); }
.bc__actGlyph { font-size: 14px; opacity: 0.75; }
.bc__actLabel { font-size: 13px; font-weight: 600; letter-spacing: 0.02em; }
.bc__actHint { font-size: 11px; color: rgba(255,255,255,0.4); }
.bc__act--danger { color: #ff7a7a; }
.bc__act--danger:hover { background: rgba(255,90,90,0.16); color: #ff9a9a; }
.bc__act--armed { background: #ff5a5a; color: #12070a; }
.bc__act--armed:hover { background: #ff6a6a; color: #12070a; }
.bc__sep { width: 1px; background: rgba(255,255,255,0.12); margin: 6px 3px; flex: 0 0 auto; }

.bc__apply {
  display: flex; align-items: center; gap: 10px; padding: 11px 20px; border-radius: 10px;
  background: var(--take); border: 0; cursor: pointer; color: #08090c; font: inherit;
  font-size: 13px; font-weight: 800; letter-spacing: 0.02em; white-space: nowrap;
  transition: filter 120ms var(--ease), transform 90ms var(--ease);
  animation: bcrise 220ms var(--ease);
}
.bc__apply:hover { filter: brightness(1.1); }
.bc__apply:active { transform: translateY(1px) scale(0.985); }
.bc__discard {
  padding: 11px 15px; border-radius: 10px; background: transparent; border: 0; cursor: pointer;
  color: rgba(255,255,255,0.6); font: inherit; font-size: 13px; font-weight: 600;
  transition: background 120ms var(--ease), color 120ms var(--ease);
}
.bc__discard:hover { background: rgba(255,255,255,0.1); color: #fff; }

@media (max-width: 980px) {
  .bc { padding-bottom: 168px; }
  .bc__band { grid-template-columns: 1fr; }
  .bc__centre { border-left: 0; border-right: 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); order: -1; }
  .bc__side { padding: 16px 20px; }
  .bc__grid, .bc__grid--simple { grid-template-columns: 1fr; }
  .bc__col + .bc__col { border-left: 0; border-top: 1px solid var(--line); }
  .bc__standby { width: auto; border-left: 0; border-right: 0; border-top: 1px solid var(--line); }
  .bc__head, .bc__row { grid-template-columns: 1fr repeat(4, 38px) 86px; }
  .bc__moves { opacity: 1; }
  .bc__railLabel { margin-left: 0; }
  .bc__dock { left: 12px; right: 12px; transform: none; max-width: none; bottom: max(12px, env(safe-area-inset-bottom)); }
  .bc__actHint { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .bc *, .bc *::after { animation: none !important; transition-duration: 1ms !important; }
}
`;

type Side = "ct" | "t" | "standby";

/** PROGRAM: what the server is actually running. Preview edits diff against it. */
const PROGRAM = {
  preset: "competitive",
  map: MATCH.map,
  mapLabel: MATCH.mapLabel,
  format: MATCH.series.format,
  overtime: MATCH.overtime,
  ctName: MATCH.ct.name,
  tName: MATCH.t.name,
  ctCaptain: PLAYERS.find((p) => p.side === "ct" && p.captain)!.id,
  tCaptain: PLAYERS.find((p) => p.side === "t" && p.captain)!.id,
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
  const [armed, setArmed] = useState(false);
  /** Bumped on every apply purely to re-key the cut, so it replays each time. */
  const [cut, setCut] = useState(0);

  const dial = useDialKit(
    "Broadcast",
    {
      stage: { artOpacity: [0.28, 0, 1], veil: [0.92, 0.4, 1], bandPad: [26, 8, 64] },
      type: { scoreSize: [11, 4, 16], teamSize: [28, 14, 48] },
      colour: { ct: "#3d8bfd", t: "#ff9422", live: "#ff4d4d", take: "#ffd166" },
      rows: { rowPad: [11, 2, 24], barOpacity: [0.13, 0, 0.6] },
    },
    { id: "broadcast-direction", persist: true },
  );

  const move = (id: string, to: Side) =>
    setPreview((p) => {
      const sides = { ...p.sides, [id]: to };
      /* A captain who leaves a side stops being its captain — otherwise the
         badge would sit in the standby column claiming to lead a team. */
      return {
        ...p,
        sides,
        ctCaptain: p.ctCaptain === id && to !== "ct" ? "" : p.ctCaptain,
        tCaptain: p.tCaptain === id && to !== "t" ? "" : p.tCaptain,
      };
    });

  const setCaptain = (id: string, side: Side) =>
    setPreview((p) => (side === "ct" ? { ...p, ctCaptain: id } : { ...p, tCaptain: id }));

  const pickMap = (name: string, label: string) =>
    setPreview((p) => ({ ...p, map: name, mapLabel: label }));

  /**
   * The staged diff, in the words the chips use. Deriving it from the two
   * objects rather than tracking a dirty flag per control is what stops the dock
   * claiming a change that is not there, or missing one that is.
   */
  const changes = useMemo(() => {
    const out: { key: string; label: string; to: string }[] = [];
    const nameOf = (id: string) => ALL_PLAYERS.find((p) => p.id === id)?.name ?? "nobody";
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
    if (preview.ctCaptain !== PROGRAM.ctCaptain)
      out.push({ key: "ctCap", label: "CT captain", to: nameOf(preview.ctCaptain) });
    if (preview.tCaptain !== PROGRAM.tCaptain)
      out.push({ key: "tCap", label: "T captain", to: nameOf(preview.tCaptain) });
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
  const captainName = (id: string) => ALL_PLAYERS.find((p) => p.id === id)?.name;

  const apply = () => {
    setCut((n) => n + 1);
    setPreview(PROGRAM);
  };

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
    const isCaptain = (side === "ct" ? preview.ctCaptain : preview.tCaptain) === p.id;
    const wasCaptain = (side === "ct" ? PROGRAM.ctCaptain : PROGRAM.tCaptain) === p.id;
    return (
      <div className={`bc__row${moved ? " bc__row--moved" : ""}`}>
        <span className="bc__bar" style={{ width: `${Math.min(100, p.adr)}%` }} aria-hidden />
        <span className="bc__who">
          <span className="bc__player">{p.name}</span>
          <button
            type="button"
            className={`bc__cap${isCaptain ? " bc__cap--on" : ""}${
              isCaptain && !wasCaptain ? " bc__cap--staged" : ""
            }`}
            aria-pressed={isCaptain}
            title={isCaptain ? "Captain" : `Make ${p.name} captain`}
            onClick={() => setCaptain(p.id, side)}
          >
            C
          </button>
        </span>
        <span className="bc__num">{p.kills}</span>
        <span className="bc__num bc__num--dim">{p.deaths}</span>
        <span className="bc__num">{kd(p)}</span>
        <span className="bc__num bc__num--dim">{p.adr}</span>
        <span className="bc__moves">
          <button className="bc__move" type="button" onClick={() => move(p.id, "standby")} title="Bench">
            Bench
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
          <span className="bc__railLabel">Mode</span>
          <div className="bc__seg" role="group" aria-label="Game mode">
            {PRESETS.map((p) => {
              const on = preview.preset === p.id;
              const staged = on && p.id !== PROGRAM.preset;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  className={`bc__segBtn${on ? (staged ? " bc__segBtn--staged" : " bc__segBtn--on") : ""}`}
                  onClick={() => setPreview((v) => ({ ...v, preset: p.id }))}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="bc__band">
          {cut > 0 && <div key={cut} className="bc__cut" aria-hidden />}

          <div className="bc__side bc__ct">
            <span className="bc__sideMark" aria-hidden />
            <span className="bc__team">
              <span className="bc__tag">
                Counter-Terrorists · {ct.length}
                {captainName(preview.ctCaptain) && (
                  <span className="bc__capName"> · c {captainName(preview.ctCaptain)}</span>
                )}
              </span>
              <span className="bc__nameWrap">
                <input
                  className={`bc__nameField${preview.ctName !== PROGRAM.ctName ? " bc__nameField--staged" : ""}`}
                  value={preview.ctName}
                  onChange={(e) => setPreview((v) => ({ ...v, ctName: e.target.value }))}
                  aria-label="Counter-Terrorist team name"
                  spellCheck={false}
                />
                <span className="bc__pencil" aria-hidden>
                  ✎
                </span>
              </span>
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
              aria-expanded={poolOpen}
              className={`bc__mapBtn${preview.map !== PROGRAM.map ? " bc__mapBtn--staged" : ""}`}
              onClick={() => setPoolOpen((v) => !v)}
            >
              {preview.mapLabel}
              <span className={`bc__caret${poolOpen ? " bc__caret--open" : ""}`} aria-hidden>
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
                <div className="bc__seg" role="group" aria-label="Series length">
                  {FORMATS.map((f) => {
                    const on = preview.format === f;
                    const staged = on && f !== PROGRAM.format;
                    return (
                      <button
                        key={f}
                        type="button"
                        aria-pressed={on}
                        className={`bc__segBtn${on ? (staged ? " bc__segBtn--staged" : " bc__segBtn--on") : ""}`}
                        onClick={() => setPreview((v) => ({ ...v, format: f }))}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <button
              type="button"
              role="switch"
              aria-checked={preview.overtime}
              className={`bc__switch${preview.overtime ? " bc__switch--on" : ""}${
                preview.overtime !== PROGRAM.overtime ? " bc__switch--staged" : ""
              }`}
              onClick={() => setPreview((v) => ({ ...v, overtime: !v.overtime }))}
            >
              <span className="bc__track" aria-hidden>
                <span className="bc__knob" />
              </span>
              Overtime
            </button>
          </div>

          <div className="bc__side bc__side--t bc__t">
            <span className="bc__sideMark" aria-hidden />
            <span className="bc__team">
              <span className="bc__tag">
                Terrorists · {t.length}
                {captainName(preview.tCaptain) && (
                  <span className="bc__capName"> · c {captainName(preview.tCaptain)}</span>
                )}
              </span>
              <span className="bc__nameWrap">
                <input
                  className={`bc__nameField${preview.tName !== PROGRAM.tName ? " bc__nameField--staged" : ""}`}
                  value={preview.tName}
                  onChange={(e) => setPreview((v) => ({ ...v, tName: e.target.value }))}
                  aria-label="Terrorist team name"
                  spellCheck={false}
                />
                <span className="bc__pencil" aria-hidden>
                  ✎
                </span>
              </span>
            </span>
            <span className="bc__score">{MATCH.t.score}</span>
          </div>
        </div>

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
            <button className="bc__poolBtn" type="button" aria-expanded={poolOpen} onClick={() => setPoolOpen((v) => !v)}>
              {poolOpen ? "Hide pool" : "Re-veto"}
              <span className={`bc__caret${poolOpen ? " bc__caret--open" : ""}`} aria-hidden>
                ▾
              </span>
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

          {competitive && (
            <div className="bc__standby">
              <div className="bc__sbHead">Standby · {standby.length}</div>
              {standby.length === 0 && (
                <p className="bc__sbEmpty">
                  Everyone connected is on a side. Bench someone with the button on their row.
                </p>
              )}
              {standby.map((p) => (
                <div key={p.id} className="bc__sbRow">
                  <span className="bc__moves">
                    <button className="bc__move" type="button" onClick={() => move(p.id, "ct")}>
                      ◂ CT
                    </button>
                  </span>
                  <span className="bc__sbName">{p.name}</span>
                  <span className="bc__moves">
                    <button className="bc__move" type="button" onClick={() => move(p.id, "t")}>
                      T ▸
                    </button>
                  </span>
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
      </div>

      {/*
        The dock. One floating object that holds everything you can do right now:
        the live interventions always, and — when preview differs from program —
        an amber section that names the count and puts it on air. It grows rather
        than being replaced, so the controls never move out from under you.
      */}
      <div className="bc__dock">
        {dirty && (
          <div className="bc__dockChips">
            {changes.map((c) => (
              <span key={c.key} className="bc__chip">
                {c.label} <em>{c.to}</em>
              </span>
            ))}
          </div>
        )}
        <div className="bc__dockBar">
          <button className="bc__act" type="button">
            <span className="bc__actGlyph" aria-hidden>
              ⏸
            </span>
            <span className="bc__actLabel">Pause</span>
            <span className="bc__actHint">next freeze</span>
          </button>
          <button className="bc__act" type="button">
            <span className="bc__actGlyph" aria-hidden>
              ⇄
            </span>
            <span className="bc__actLabel">Swap</span>
            <span className="bc__actHint">sides now</span>
          </button>
          <button className="bc__act" type="button">
            <span className="bc__actGlyph" aria-hidden>
              ✦
            </span>
            <span className="bc__actLabel">Knife</span>
            <span className="bc__actHint">restarts map</span>
          </button>
          <button className="bc__act" type="button">
            <span className="bc__actGlyph" aria-hidden>
              ↺
            </span>
            <span className="bc__actLabel">Backup</span>
            <span className="bc__actHint">round 11</span>
          </button>

          {/* Arm-then-confirm, so the one irreversible control is never one stray
              click away from ending the series. */}
          <button
            className={`bc__act bc__act--danger${armed ? " bc__act--armed" : ""}`}
            type="button"
            onClick={() => setArmed((v) => !v)}
            onBlur={() => setArmed(false)}
          >
            <span className="bc__actGlyph" aria-hidden>
              ⏹
            </span>
            <span className="bc__actLabel">{armed ? "Confirm — end it" : "End match"}</span>
            <span className="bc__actHint">{armed ? "click again" : "drops the series"}</span>
          </button>

          {dirty && (
            <>
              <span className="bc__sep" aria-hidden />
              <button className="bc__discard" type="button" onClick={() => setPreview(PROGRAM)}>
                Discard
              </button>
              <button className="bc__apply" type="button" onClick={apply}>
                Apply {changes.length} {changes.length === 1 ? "change" : "changes"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
