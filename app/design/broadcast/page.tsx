"use client";

/**
 * Direction 1 — BROADCAST, fourth pass.
 *
 * There is no setup screen: the scoreboard *is* the form. Team names, captains,
 * the map, the series format, overtime and who is on which side are edited in
 * place, at the size they are displayed.
 *
 * Batching borrows the idiom the direction was already using. A gallery has two
 * buses — PROGRAM is on air, PREVIEW is what you are building. Edits land in
 * preview and change nothing; the dock names exactly what is staged; applying
 * cuts all of it to air at once.
 *
 * ---
 *
 * WHAT THE THIRD PASS GOT WRONG, AND WHAT THIS ONE DOES INSTEAD
 *
 * 1. PROGRAM was a module const, so it could never move. It is state now, and
 *    the diff is `preview` against `base` — the program snapshot the preview was
 *    built from. When the server changes a field underneath you, unstaged fields
 *    follow it silently and staged ones become *conflicted*: the chip says so
 *    and offers "keep mine" or "take server". Apply is blocked until it is
 *    resolved, because the old behaviour silently reverted a halftime swap.
 *    Press "Swap sides" with a roster move staged to watch it happen.
 * 2. Apply lied about time. Program only changes when the server acknowledges,
 *    so there is now a real `applying` phase with the commands it is sending,
 *    a `failed` phase with a retry, and the cut fires on landing rather than on
 *    click. The surface goes `inert` while in flight.
 * 3. Two commitment models sat 5px apart. Immediate interventions now live in
 *    their own pill, tagged HAPPENS NOW and carrying the RCON they send. The
 *    staged pill is tagged and says nothing has reached the server yet.
 * 4. Non-Competitive modes deleted seven of twelve players. Shape is per preset
 *    now (`SHAPES`): sided modes keep two columns and a bench, unsided modes
 *    collapse to one list of everybody, sorted by frags, with kick. Structure
 *    collapses; population never does.
 * 5. The dock scrolled horizontally, so Apply was ~400px off-screen on a phone.
 *    Nothing in the dock scrolls; below 980px it stacks with the commit pill in
 *    thumb reach and the four interventions behind one "More" sheet. Hints are
 *    never hidden.
 * 6. "End match" armed and fired under the same finger. It is a sheet now, with
 *    the live stakes, a confirm on the other side of the panel, the command it
 *    sends, and a five-second auto-cancel.
 * 7. Preview claimed to change nothing and then repainted the whole background.
 *    Art, rundown, pips and the round line are all frozen to PROGRAM; a staged
 *    map shows as a cue thumbnail instead.
 *
 * The unhappy paths are reachable: the dial (top-right) has a `sim` folder that
 * forces RCON silence, Docker down, and a failing apply.
 *
 * ---
 *
 * MOTION THESIS (Operate: motion serves feedback and state, never decoration;
 * routine transitions stay under 150ms):
 *
 * - Focal moment: the cut, 260ms, fired the instant the server confirms — once
 *   per successful apply, because that is when the thing actually changed.
 * - Continuity: the dock grows a second pill rather than being replaced; sheets
 *   rise from the surface they were opened from.
 * - Feedback: every control has hover, :active depression and a focus-visible
 *   ring. Nothing relies on hover to announce that it is a control.
 * - Budget: transform and opacity only, one live dot, one progress bar while an
 *   apply is in flight. All of it is off under prefers-reduced-motion.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CaretDown,
  ClockCounterClockwise,
  Copy,
  DotsThree,
  Knife,
  Pause,
  PencilSimple,
  Stop,
  ArrowsLeftRight,
  X,
} from "@phosphor-icons/react";
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
  /* How wide a player name is allowed to get before it ellipsises. It is a
     fixed lane rather than "whatever is left" on purpose: the header labels
     and the row values only stay locked to each other if the track between
     the numbers and the column edge is the same width in both, and content
     cannot guarantee that. Everything past the lane becomes slack on the
     outer edge, which is what keeps the numbers next to the names they
     belong to instead of pinned to the far side of the column. */
  --nameLane: 15rem;
  --line: rgba(255,255,255,0.09);
  --stage: #06070a;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  min-height: calc(100svh - 32px);
  background: var(--stage);
  color: #fff;
  font-family: var(--font-geist-sans), system-ui, sans-serif;
  display: flex; flex-direction: column; position: relative; overflow: hidden;
  padding-bottom: 184px;
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
.bc__body[inert] { opacity: 0.94; }

/* every control on this page shares one focus treatment, so the keyboard path
   is never the one that got forgotten */
.bc button:focus-visible, .bc input:focus-visible {
  outline: 2px solid #fff; outline-offset: 2px;
}

/* ---- top rail ---- */
.bc__rail {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 9px 16px; border-bottom: 1px solid var(--line);
  background: rgba(0,0,0,0.42);
  font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
  color: rgba(255,255,255,0.62);
}
.bc__bus {
  display: inline-flex; align-items: center; gap: 7px; padding: 4px 9px;
  font-weight: 800; letter-spacing: 0.16em; color: #fff;
  background: var(--live); box-shadow: 0 0 22px -4px var(--live);
  transition: background 180ms var(--ease), color 180ms var(--ease);
}
.bc__bus--pvw { background: var(--take); box-shadow: 0 0 22px -4px var(--take); color: #0a0a0a; }
.bc__bus--wait { background: rgba(255,255,255,0.22); box-shadow: none; color: #fff; }
.bc__bus--bad { background: var(--bad); box-shadow: 0 0 22px -4px var(--bad); color: #14070a; }
.bc__bus--unknown { background: rgba(255,255,255,0.14); box-shadow: none; color: rgba(255,255,255,0.85); }
.bc__rail b { color: #fff; font-weight: 700; letter-spacing: 0.06em; }
.bc__rec { color: var(--live); }
.bc__rec--off { color: rgba(255,255,255,0.45); }
.bc__meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-left: auto; }
.bc__meta span { white-space: nowrap; }

/* the connect string is the single most handed-around fact in the product, so
   it is a control rather than text you have to select by hand */
.bc__copy {
  display: inline-flex; align-items: center; gap: 7px; cursor: pointer;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.16);
  color: #fff; font: inherit; font-size: 11px; letter-spacing: 0.08em; padding: 4px 9px;
  transition: background 120ms var(--ease), transform 90ms var(--ease);
}
.bc__copy:hover { background: rgba(255,255,255,0.13); }
.bc__copy:active { transform: translateY(1px); }
.bc__copy b { font-family: var(--font-geist-mono), ui-monospace, monospace; letter-spacing: 0; }

/* segmented control: a real one, with a surface, a hover state and a press */
.bc__seg { display: flex; flex-wrap: wrap; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.04); }
.bc__segBtn {
  position: relative; background: transparent; border: 0; cursor: pointer;
  padding: 7px 13px; font: inherit; font-size: 11px; letter-spacing: 0.12em;
  text-transform: uppercase; color: rgba(255,255,255,0.72);
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
.bc__segBtn--conflict { background: var(--bad); color: #14070a; font-weight: 800; }

/* ---- the band ---- */
.bc__band { display: grid; grid-template-columns: 1fr auto 1fr; border-bottom: 1px solid var(--line); position: relative; }
.bc__band--solo { grid-template-columns: 1fr; }
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
.bc__capName { color: rgba(255,255,255,0.62); }
.bc__tagWarn { color: var(--bad); }

/* an editable field, and it says so: a dashed rule that solidifies on hover */
.bc__nameWrap { display: flex; align-items: center; gap: 8px; width: 100%; }
.bc__side--t .bc__nameWrap { flex-direction: row-reverse; }
.bc__nameField {
  font: inherit; color: #fff; background: transparent; flex: 1; min-width: 0;
  border: 0; border-bottom: 1px dashed rgba(255,255,255,0.42);
  padding: 2px 2px 3px;
  font-size: calc(var(--teamSize) * 1px); font-weight: 800;
  letter-spacing: -0.02em; text-transform: uppercase; line-height: 1.05;
  transition: border-color 120ms var(--ease), color 120ms var(--ease);
  cursor: text;
}
.bc__side--t .bc__nameField { text-align: right; }
.bc__nameField:hover { border-bottom-color: rgba(255,255,255,0.75); }
.bc__nameField:focus { border-bottom: 1px solid var(--take); }
.bc__nameField--staged { border-bottom: 1px solid var(--take); color: var(--take); }
.bc__nameField--conflict { border-bottom: 1px solid var(--bad); color: var(--bad); }
.bc__nameField--bad { border-bottom: 1px solid var(--bad); }
.bc__pencil { font-size: 13px; color: rgba(255,255,255,0.55); flex: 0 0 auto; }

.bc__score {
  font-size: clamp(48px, calc(var(--scoreSize) * 1vw), 132px);
  font-weight: 800; line-height: 0.8; letter-spacing: -0.05em;
  font-variant-numeric: tabular-nums;
}

.bc__centre {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 22px; min-width: 280px; max-width: 470px;
  border-left: 1px solid var(--line); border-right: 1px solid var(--line);
  background: rgba(255,255,255,0.02);
}
.bc__live {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 11px; letter-spacing: 0.2em; font-weight: 700; text-transform: uppercase;
  color: var(--live);
}
.bc__live--unknown { color: rgba(255,255,255,0.75); }
.bc__dot { width: 7px; height: 7px; border-radius: 99px; background: currentColor; animation: bcpulse 1.6s ease-in-out infinite; }
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
.bc__caret { font-size: 13px; opacity: 0.7; }
.bc__round { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255,255,255,0.62); font-variant-numeric: tabular-nums; text-align: center; }

/* the staged map never repaints the stage — it shows up here as a cue */
.bc__cue {
  display: inline-flex; align-items: center; gap: 9px; padding: 5px 9px 5px 5px;
  border: 1px solid var(--take); color: var(--take);
  font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700;
  animation: bcrise 200ms var(--ease);
}
.bc__cueArt { width: 42px; height: 26px; background-size: cover; background-position: center; flex: 0 0 auto; }
.bc__cueX {
  background: transparent; border: 0; color: inherit; font: inherit; cursor: pointer;
  padding: 0 2px; opacity: 0.7;
}
.bc__cueX:hover { opacity: 1; }

/* a switch, not a word that happens to be clickable */
.bc__switch {
  display: inline-flex; align-items: center; gap: 9px; cursor: pointer;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.16);
  padding: 5px 11px 5px 7px; font: inherit;
  font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
  color: rgba(255,255,255,0.72);
  transition: background 120ms var(--ease), color 120ms var(--ease), border-color 120ms var(--ease), transform 90ms var(--ease);
}
.bc__switch:hover { background: rgba(255,255,255,0.11); color: #fff; }
.bc__switch:active { transform: translateY(1px); }
.bc__track {
  width: 26px; height: 14px; border-radius: 99px; background: rgba(255,255,255,0.24);
  position: relative; flex: 0 0 auto; transition: background 160ms var(--ease);
}
.bc__knob {
  position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; border-radius: 99px;
  background: #fff; transition: transform 160ms var(--ease);
}
.bc__switch--on { color: #fff; border-color: rgba(255,255,255,0.4); }
.bc__switch--on .bc__track { background: rgba(255,255,255,0.6); }
.bc__switch--on .bc__knob { transform: translateX(12px); }
.bc__switch--staged { border-color: var(--take); color: var(--take); }
.bc__switch--staged .bc__track { background: var(--take); }

/* The mode picker shows only the mode you are on; the other four live behind
   it. It resolves rather than arrives — scaling up out of the trigger and
   coming out of blur — so opening it reads as bringing a decision into focus
   rather than as a panel flying in from somewhere offscreen. */
.bc__mode { position: relative; display: inline-block; }
.bc__modeBtn {
  list-style: none; cursor: pointer; position: relative; z-index: 41;
  display: inline-flex; align-items: center; gap: 10px;
  border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.06);
  padding: 6px 13px; color: #fff;
  font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
  transition: background 120ms var(--ease), border-color 120ms var(--ease);
}
.bc__modeBtn::-webkit-details-marker { display: none; }
.bc__modeBtn:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.34); }
.bc__modeBtn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.bc__modeName { font-weight: 800; }
.bc__modeShape { font-size: 10px; letter-spacing: 0.06em; text-transform: none; color: rgba(255,255,255,0.44); }
.bc__modeBtn--staged { border-color: var(--take); color: var(--take); }
.bc__modeBtn--staged .bc__modeShape { color: var(--take); opacity: 0.72; }
.bc__modeBtn--conflict { border-color: var(--bad); color: var(--bad); }
.bc__modeBtn--conflict .bc__modeShape { color: var(--bad); opacity: 0.72; }
.bc__modeMenu {
  position: absolute; top: calc(100% + 6px); left: 50%; translate: -50% 0;
  z-index: 40; min-width: 258px; transform-origin: top center;
  border: 1px solid rgba(255,255,255,0.28); background: #0b0d12;
  box-shadow: 0 24px 60px -20px rgba(0,0,0,0.9);
  display: flex; flex-direction: column;
}
.bc__mode[open] .bc__modeMenu { animation: bcmode 300ms var(--ease) both; }
@keyframes bcmode {
  from { opacity: 0; transform: scale(0.94) translateY(-5px); filter: blur(7px); }
  to { opacity: 1; transform: none; filter: blur(0); }
}
.bc__modeOpt {
  display: flex; flex-direction: column; gap: 2px; text-align: left;
  background: transparent; border: 0; border-bottom: 1px solid rgba(255,255,255,0.08);
  cursor: pointer; color: rgba(255,255,255,0.8); font: inherit; padding: 9px 13px;
  transition: background 110ms var(--ease), color 110ms var(--ease);
}
.bc__modeOpt:last-child { border-bottom: 0; }
.bc__modeOpt:hover { background: rgba(255,255,255,0.1); color: #fff; }
.bc__modeOpt--on { background: rgba(255,255,255,0.16); color: #fff; box-shadow: inset 2px 0 0 #fff; }
.bc__modeOptName { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 800; }
.bc__modeOptShape { font-size: 10px; letter-spacing: 0.06em; color: rgba(255,255,255,0.44); }

.bc__pips { display: flex; gap: 5px; }
.bc__pip { width: 26px; height: 4px; background: rgba(255,255,255,0.2); }
.bc__pip--ct { background: var(--ct); }
.bc__pip--t { background: var(--t); }
.bc__pip--now { background: #fff; }

/* the cut: the one authored moment, fired when the server confirms */
.bc__cut {
  position: absolute; inset: 0; pointer-events: none; z-index: 4;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent);
  animation: bccut 260ms var(--ease) forwards;
}
@keyframes bccut {
  from { transform: translateX(-100%); opacity: 0.9; }
  to { transform: translateX(100%); opacity: 0; }
}

/* ---- rundown ---- */
.bc__rundown { display: flex; align-items: stretch; border-bottom: 1px solid var(--line); background: rgba(0,0,0,0.3); flex-wrap: wrap; }
.bc__rdLabel {
  padding: 12px 16px; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase;
  color: rgba(255,255,255,0.55); display: flex; align-items: center;
  border-right: 1px solid var(--line); white-space: nowrap;
}
.bc__rdMaps { display: flex; flex: 1 1 320px; }
.bc__rd {
  position: relative; flex: 1 1 130px; min-width: 0; min-height: 62px; padding: 10px 14px;
  border-right: 1px solid var(--line); background: transparent;
  color: #fff; text-align: left; display: flex; flex-direction: column; justify-content: center; gap: 3px;
  overflow: hidden;
}
.bc__rdArt { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: 0.22; transition: opacity 160ms var(--ease); }
.bc__rdName { position: relative; font-size: 14px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bc__rdNote { position: relative; font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.62); }
.bc__rd--live { box-shadow: inset 3px 0 0 var(--live); }
.bc__rd--live .bc__rdNote { color: var(--live); }
.bc__rd--done .bc__rdName { color: rgba(255,255,255,0.62); }
.bc__rd--done .bc__rdArt { filter: grayscale(0.8); opacity: 0.12; }
/* the upcoming map had no rule at all in the third pass, so "next" was the one
   series state with no treatment. Dashed means not-yet, as it does everywhere. */
.bc__rd--next { box-shadow: inset 0 0 0 1px rgba(255,255,255,0.14); }
.bc__rd--next .bc__rdName { color: rgba(255,255,255,0.9); }
.bc__rd--next .bc__rdArt { opacity: 0.12; }
.bc__rd--next::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  background: repeating-linear-gradient(180deg, rgba(255,255,255,0.55) 0 5px, transparent 5px 10px);
}
.bc__rd--cued { box-shadow: inset 3px 0 0 var(--take); }
.bc__rd--cued .bc__rdNote { color: var(--take); }
.bc__poolBtn {
  padding: 0 18px; background: rgba(255,255,255,0.05); border: 0; border-left: 1px solid var(--line);
  color: rgba(255,255,255,0.85); font: inherit; font-size: 10px; letter-spacing: 0.18em;
  text-transform: uppercase; cursor: pointer; white-space: nowrap;
  display: inline-flex; align-items: center; gap: 8px; min-height: 44px;
  transition: background 120ms var(--ease), color 120ms var(--ease);
}
.bc__poolBtn:hover { color: #fff; background: rgba(255,255,255,0.12); }

/* ---- rosters ----

   Two variations of one row, not one row bent out of shape by overrides.

   The score band has always mirrored: .bc__side--t reverses and pushes the team
   to the outer edge. The rosters under it did not, and the symmetry broke
   exactly where the eye goes looking for it. Now there are two variants —
   bc__row--l puts the name at the start of the row, bc__row--r at the end —
   and each one places every child of the row explicitly, at every width.

   The names face the centre and the numbers sit just outside them, which is
   the opposite of the band above it. That is on purpose. The band is two teams
   shouting across a gap; the roster is one table you read as a pair, and the
   two name columns meeting over the bench are what make it read as one. Any
   width left over goes past the numbers to the outer edge of the column rather
   than opening a hole between a player and their own line.

   Explicit is the whole point. The first attempt at this mirrored T by
   re-placing three of the four children and leaving the rest to auto-placement,
   so the header's spacer, the stats track and the hover overlay were all
   resolving against a cursor that moved whenever any one of them did. Nothing
   below depends on document order, which is also what lets the stacked layout
   un-mirror both variants in a handful of lines rather than unpicking the
   overrides one at a time.

   The five stat columns keep their order on both sides. The mirror is about
   which edge a block sits against, not about reading numbers backwards: K stays
   the first column on both halves so the two teams compare down a line. What
   does mirror is the alignment inside each cell: the digits hug whichever side
   of their 46px is nearest the name, so a number leans back toward the player
   it belongs to instead of drifting off the outside edge. */
.bc__grid { display: grid; grid-template-columns: 1fr auto 1fr; flex: 1; min-height: 0; }
.bc__grid--solo { grid-template-columns: 1fr; }
.bc__col { padding: 14px 16px 20px; min-width: 0; }
.bc__col + .bc__col { border-left: 1px solid var(--line); }
.bc__head, .bc__row { display: grid; gap: 12px; align-items: center; }
.bc__head {
  padding: 0 10px 8px;
  font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(255,255,255,0.55); font-weight: 600;
}
.bc__headName { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bc__stats { display: grid; grid-template-columns: repeat(5, 46px); gap: 8px; }
.bc__row {
  padding: var(--rowPad) 10px; position: relative;
  font-variant-numeric: tabular-nums; border-top: 1px solid rgba(255,255,255,0.05);
  transition: background 120ms var(--ease);
}
.bc__row:hover { background: rgba(255,255,255,0.04); }
.bc__who { display: flex; align-items: center; gap: 9px; min-width: 0; position: relative; }
.bc__moves { display: flex; gap: 5px; position: relative; }
.bc__player { font-weight: 700; font-size: 15px; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bc__rank { font-size: 11px; color: rgba(255,255,255,0.5); font-weight: 700; width: 16px; flex: 0 0 auto; }
.bc__num { font-size: 14px; font-weight: 600; position: relative; }
.bc__num--dim { color: rgba(255,255,255,0.62); font-weight: 500; }

/* captaincy is a control: exactly one per side, click a badge to move it */
.bc__cap {
  font-size: 9px; font-weight: 800; letter-spacing: 0.1em; padding: 5px 7px;
  background: transparent; border: 1px solid rgba(255,255,255,0.3); color: rgba(255,255,255,0.7);
  cursor: pointer; flex: 0 0 auto; font-family: inherit;
  transition: background 120ms var(--ease), color 120ms var(--ease), border-color 120ms var(--ease);
}
.bc__cap:hover { border-color: #fff; color: #fff; }
.bc__cap--on { background: #fff; color: #06070a; border-color: #fff; }
.bc__cap--staged { background: var(--take); border-color: var(--take); color: #0a0a0a; }

/* The row meter starts under the name and grows away from the centre, so the
   two sides push outward rather than into each other. Only the tint is
   per-column; the direction belongs to the variant, which is why it is a
   custom property rather than four gradients. */
.bc__bar {
  position: absolute; inset: 0 auto 0 0; opacity: var(--barOpacity); pointer-events: none;
  --barTint: rgba(255,255,255,0.5);
  background: linear-gradient(to right, var(--barTint), transparent);
}
.bc__ctcol .bc__bar { --barTint: var(--ct); }
.bc__tcol .bc__bar { --barTint: var(--t); }

/* Name at the start of the row, numbers after it. This is also the shape any
   list with no centre to mirror around falls back to: the bench, the unsided
   roster, and both sides once the columns stack. On the board it is the T
   side, the column whose start is the centre. */
.bc__head--l, .bc__row--l { grid-template-columns: minmax(0,var(--nameLane)) auto minmax(0,1fr); }
.bc__head--l .bc__headName { grid-area: 1 / 1; }
.bc__head--l .bc__stats { grid-area: 1 / 2; text-align: left; }
.bc__row--l .bc__who { grid-area: 1 / 1; }
.bc__row--l .bc__stats { grid-area: 1 / 2; text-align: left; }
.bc__row--l .bc__moves { grid-area: 1 / 3; justify-content: flex-start; }

/* Name at the end of the row: the same row about a vertical axis. On the board
   it is the CT side, the column whose end is the centre. The two flex lines
   reverse so the captain badge and the move cluster mirror too; the DOM keeps
   name-then-stats-then-moves on both sides, which is the order a screen reader
   wants and the order tabbing follows. */
.bc__head--r, .bc__row--r { grid-template-columns: minmax(0,1fr) auto minmax(0,var(--nameLane)); }
.bc__head--r .bc__headName { grid-area: 1 / 3; text-align: right; }
.bc__head--r .bc__stats { grid-area: 1 / 2; text-align: right; }
.bc__row--r .bc__who { grid-area: 1 / 3; flex-direction: row-reverse; }
.bc__row--r .bc__stats { grid-area: 1 / 2; text-align: right; }
.bc__row--r .bc__moves { grid-area: 1 / 1; flex-direction: row-reverse; }
.bc__row--r .bc__bar { inset: 0 0 0 auto; background: linear-gradient(to left, var(--barTint), transparent); }

/* The moves sit at the end of the NAME lane instead of owning a column of
   their own, so the stats keep their full width and their own track goes back
   to being pure slack — the same slack the header has in that position, which
   is what keeps K / D / K/D / ADR / Ping over the numbers they
   label. The cluster resolves out of blur while the name behind it blurs
   and dims: a depth swap rather than an arrival. It arrives from whichever end
   of that column the name is not using, which is the only thing the two
   variants disagree about here.

   All of it is gated on a real pointer. A phone has no hover, so hiding Kick
   and Bench there would put them somewhere nobody can reach; on touch the
   roster keeps the layout it has always had. :focus-within is on the same rule
   so the keyboard path reveals the cluster too. */
@media (hover: hover) and (pointer: fine) {
  .bc__row .bc__moves {
    grid-row: 1; align-self: center;
    opacity: 0; pointer-events: none;
    transform: scale(0.92); filter: blur(5px);
    transition: opacity 220ms var(--ease), transform 220ms var(--ease), filter 220ms var(--ease);
  }
  .bc__row--l .bc__moves {
    grid-column: 1; justify-self: end; padding-left: 30px; transform-origin: right center;
    background: linear-gradient(to right, transparent, rgba(9,11,15,0.92) 30px);
  }
  .bc__row--r .bc__moves {
    grid-column: 3; justify-self: start; padding-right: 30px; transform-origin: left center;
    background: linear-gradient(to left, transparent, rgba(9,11,15,0.92) 30px);
  }
  .bc__row .bc__player { transition: filter 180ms var(--ease), opacity 180ms var(--ease); }
  .bc__row:hover .bc__player { filter: blur(2px); opacity: 0.45; }
  .bc__row:hover .bc__moves,
  .bc__row:focus-within .bc__moves { opacity: 1; pointer-events: auto; transform: none; filter: none; }
}
.bc__move {
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); cursor: pointer; color: #fff;
  font: inherit; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; padding: 7px 9px;
  min-height: 32px; white-space: nowrap;
  transition: background 120ms var(--ease), color 120ms var(--ease), transform 90ms var(--ease);
}
.bc__move:hover { background: #fff; color: #06070a; border-color: #fff; }
.bc__move:active { transform: translateY(1px); }
.bc__move--now { border-color: rgba(255,120,120,0.5); color: #ff9a9a; background: rgba(255,90,90,0.1); }
.bc__move--now:hover { background: var(--bad); color: #14070a; border-color: var(--bad); }
/* The staged / conflicted marker rides the name's edge, so it lands beside the
   player it marks and recolours rather than across the row from it. */
.bc__row--moved { box-shadow: inset 3px 0 0 var(--take); }
.bc__row--r.bc__row--moved { box-shadow: inset -3px 0 0 var(--take); }
.bc__row--moved .bc__player { color: var(--take); }
.bc__row--conflict { box-shadow: inset 3px 0 0 var(--bad); }
.bc__row--r.bc__row--conflict { box-shadow: inset -3px 0 0 var(--bad); }
.bc__row--conflict .bc__player { color: var(--bad); }

.bc__standby {
  width: 232px; border-left: 1px solid var(--line); border-right: 1px solid var(--line);
  padding: 14px 12px; background: rgba(0,0,0,0.25);
}
.bc__sbHead {
  font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(255,255,255,0.55); font-weight: 600; padding: 0 4px 10px;
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.bc__sbRow { display: flex; align-items: center; gap: 8px; padding: 8px 4px; border-top: 1px solid rgba(255,255,255,0.05); }
.bc__sbName { font-size: 14px; font-weight: 700; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bc__sbEmpty { padding: 10px 4px; font-size: 12px; color: rgba(255,255,255,0.55); line-height: 1.5; }

/* ---- the dock ---- */
.bc__dock {
  position: fixed; left: 50%; bottom: 20px; z-index: 30;
  transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  width: min(1180px, calc(100vw - 28px));
}
.bc__chips {
  display: flex; align-items: center; gap: 7px; flex-wrap: wrap; justify-content: center;
  max-height: 96px; overflow: auto;
  animation: bcrise 220ms var(--ease);
}
@keyframes bcrise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.bc__chip {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 5px 6px 5px 10px; font-size: 11px; letter-spacing: 0.04em;
  background: rgba(12,14,19,0.94); border: 1px solid rgba(255,255,255,0.2); color: #fff;
  font-weight: 600; white-space: nowrap; backdrop-filter: blur(12px);
}
.bc__chip em { font-style: normal; color: var(--take); }
.bc__chipNote { color: rgba(255,255,255,0.62); font-weight: 500; letter-spacing: 0; }
.bc__chip--heavy { border-color: rgba(255,209,102,0.6); }
.bc__chip--conflict { border-color: var(--bad); }
.bc__chip--conflict em { color: var(--bad); }
.bc__chipX {
  background: transparent; border: 0; color: rgba(255,255,255,0.7); cursor: pointer;
  font: inherit; font-size: 13px; line-height: 1; padding: 3px 5px;
  transition: background 120ms var(--ease), color 120ms var(--ease);
}
.bc__chipX:hover { background: rgba(255,255,255,0.15); color: #fff; }
.bc__chipFix {
  background: rgba(255,255,255,0.12); border: 0; color: #fff; cursor: pointer;
  font: inherit; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; padding: 4px 7px;
}
.bc__chipFix:hover { background: #fff; color: #0a0a0a; }
.bc__undo {
  display: inline-flex; align-items: center; gap: 10px; padding: 6px 8px 6px 12px;
  background: rgba(12,14,19,0.94); border: 1px solid rgba(255,255,255,0.2);
  font-size: 12px; color: rgba(255,255,255,0.85); backdrop-filter: blur(12px);
  animation: bcrise 200ms var(--ease);
}

.bc__bars { display: flex; gap: 8px; align-items: stretch; justify-content: center; width: 100%; }
.bc__pill {
  display: flex; align-items: stretch; gap: 4px; padding: 6px;
  background: rgba(12,14,19,0.88); backdrop-filter: blur(20px) saturate(1.3);
  border: 1px solid rgba(255,255,255,0.16); border-radius: 15px;
  box-shadow: 0 22px 60px -22px rgba(0,0,0,0.95), 0 1px 0 rgba(255,255,255,0.07) inset;
  min-width: 0;
}
.bc__pillTag {
  display: flex; align-items: center; padding: 0 10px 0 8px;
  font-size: 9px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(255,255,255,0.55); white-space: nowrap;
}
.bc__pill--commit { border-color: rgba(255,209,102,0.45); animation: bcrise 220ms var(--ease); }
.bc__pill--commit .bc__pillTag { color: var(--take); }
.bc__pill--bad { border-color: var(--bad); }
.bc__pill--bad .bc__pillTag { color: var(--bad); }
.bc__act {
  display: flex; align-items: center; gap: 9px; padding: 10px 14px; border-radius: 10px;
  background: transparent; border: 0; cursor: pointer; color: #fff; font: inherit;
  white-space: nowrap; min-height: 44px;
  transition: background 120ms var(--ease), transform 90ms var(--ease), color 120ms var(--ease);
}
.bc__act:hover { background: rgba(255,255,255,0.12); }
.bc__act:active { transform: translateY(1px) scale(0.985); }
.bc__actGlyph { display: inline-flex; align-items: center; opacity: 0.85; }
.bc__actLabel { font-size: 13px; font-weight: 600; letter-spacing: 0.02em; }
/* the dock speaks through one line now, but the More sheet still sets a hint
   under each row, where there is room for it */
.bc__actHint { font-size: 11px; color: rgba(255,255,255,0.62); }

/* One voice. Every control used to carry its own hint inline, and six hints
   are what set this bar's width — which is why the dock outgrew the 184px the
   page reserves for it and started sitting over the content. Now they share a
   single status line, the way a pro tool's status bar works: whatever you point
   at speaks through it, and it reports what is staged when you point at
   nothing. Six strings, one line's worth of space. */
.bc__nowPill { flex-direction: column; align-items: stretch; gap: 0; position: relative; padding-bottom: 26px; }
.bc__nowRow { display: flex; align-items: stretch; gap: 4px; }
/* a transform here would make the pressed button the containing block and the
   line would jump inside it, so this one presses with light instead */
.bc__nowRow .bc__act:active { transform: none; background: rgba(255,255,255,0.18); }
.bc__actSay, .bc__nowSay {
  position: absolute; left: 12px; right: 12px; bottom: 7px;
  font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: opacity 130ms var(--ease);
}
.bc__actSay { color: #fff; opacity: 0; pointer-events: none; }
.bc__act:hover .bc__actSay, .bc__act:focus-visible .bc__actSay { opacity: 1; }
.bc__nowSay { color: rgba(255,255,255,0.5); }
.bc__nowPill:has(.bc__act:hover) .bc__nowSay,
.bc__nowPill:has(.bc__act:focus-visible) .bc__nowSay { opacity: 0; }
.bc__act--danger { color: #ff9a9a; }
.bc__act--danger:hover { background: rgba(255,90,90,0.16); color: #ffb3b3; }
.bc__more { display: none; }

.bc__commitCopy { display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 4px 10px; min-width: 0; max-width: 34ch; }
.bc__commitLine { font-size: 12px; font-weight: 600; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bc__commitSub { font-size: 11px; color: rgba(255,255,255,0.62); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bc__commitSub--bad { color: #ff9a9a; }
.bc__apply {
  display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
  padding: 9px 18px; border-radius: 10px; min-height: 44px; justify-content: center;
  background: var(--take); border: 0; cursor: pointer; color: #08090c; font: inherit;
  white-space: nowrap;
  transition: filter 120ms var(--ease), transform 90ms var(--ease);
}
.bc__apply:hover:not(:disabled) { filter: brightness(1.1); }
.bc__apply:active:not(:disabled) { transform: translateY(1px) scale(0.985); }
.bc__apply:disabled { cursor: not-allowed; background: rgba(255,255,255,0.14); color: rgba(255,255,255,0.55); }
.bc__applyLabel { font-size: 13px; font-weight: 800; letter-spacing: 0.02em; }
.bc__applyHint { font-size: 10.5px; font-weight: 600; opacity: 0.72; }
.bc__kbd {
  font-family: var(--font-geist-mono), ui-monospace, monospace; font-size: 10px;
  border: 1px solid currentColor; opacity: 0.6; padding: 1px 4px; margin-left: 6px;
}
.bc__discard {
  padding: 11px 14px; border-radius: 10px; background: transparent; border: 0; cursor: pointer;
  color: rgba(255,255,255,0.78); font: inherit; font-size: 13px; font-weight: 600; min-height: 44px;
  transition: background 120ms var(--ease), color 120ms var(--ease);
}
.bc__discard:hover { background: rgba(255,255,255,0.1); color: #fff; }

/* an apply is a request, not a fact — this is the wait, with the wire showing */
.bc__progWrap { position: relative; overflow: hidden; border-radius: 10px; }
.bc__prog {
  position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--take);
  transform-origin: left; animation: bcprog var(--applyMs) linear forwards;
}
@keyframes bcprog { from { transform: scaleX(0); } to { transform: scaleX(1); } }

/* ---- sheets: pool, more, and every confirm ---- */
.bc__scrim { position: fixed; inset: 0; background: rgba(4,5,8,0.68); z-index: 40; animation: bcfade 140ms var(--ease); }
@keyframes bcfade { from { opacity: 0; } to { opacity: 1; } }
.bc__sheet {
  position: fixed; z-index: 41; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(680px, calc(100vw - 24px)); max-height: min(80svh, 760px); overflow: auto;
  background: rgba(14,16,22,0.98); border: 1px solid rgba(255,255,255,0.18); border-radius: 16px;
  box-shadow: 0 44px 100px -34px rgba(0,0,0,0.95);
  animation: bcsheet 180ms var(--ease);
}
@keyframes bcsheet { from { opacity: 0; transform: translate(-50%, calc(-50% + 12px)); } to { opacity: 1; transform: translate(-50%, -50%); } }
.bc__sheetHead { padding: 18px 20px 14px; border-bottom: 1px solid var(--line); }
.bc__sheetTitle { font-size: 19px; font-weight: 800; letter-spacing: -0.01em; }
.bc__sheetSub { margin-top: 6px; font-size: 13px; line-height: 1.5; color: rgba(255,255,255,0.75); }
.bc__sheetBody { padding: 16px 20px; }
.bc__sheetFoot {
  display: flex; align-items: center; gap: 10px; padding: 14px 20px;
  border-top: 1px solid var(--line); background: rgba(255,255,255,0.02);
}
.bc__sheetSpacer { flex: 1; }
.bc__rcon {
  display: block; margin-top: 12px; padding: 9px 11px;
  background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.12);
  font-family: var(--font-geist-mono), ui-monospace, monospace; font-size: 12px;
  color: rgba(255,255,255,0.9); white-space: pre-wrap; word-break: break-word;
}
.bc__btn {
  padding: 11px 16px; border-radius: 9px; min-height: 44px; cursor: pointer; font: inherit;
  font-size: 13px; font-weight: 700; border: 1px solid rgba(255,255,255,0.22);
  background: rgba(255,255,255,0.06); color: #fff;
  transition: background 120ms var(--ease), transform 90ms var(--ease);
}
.bc__btn:hover { background: rgba(255,255,255,0.14); }
.bc__btn:active { transform: translateY(1px); }
.bc__btn--danger { background: var(--bad); border-color: var(--bad); color: #14070a; }
.bc__btn--danger:hover { filter: brightness(1.08); background: var(--bad); }
.bc__count { font-size: 12px; color: rgba(255,255,255,0.65); font-variant-numeric: tabular-nums; }

.bc__poolGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 8px; }
.bc__poolMap {
  position: relative; min-height: 84px; padding: 10px 12px;
  border: 1px solid rgba(255,255,255,0.14); background: transparent; cursor: pointer;
  color: #fff; text-align: left; overflow: hidden;
  display: flex; flex-direction: column; justify-content: flex-end; gap: 2px;
  transition: transform 120ms var(--ease), border-color 120ms var(--ease);
}
.bc__poolMap:hover:not(:disabled) { border-color: #fff; }
.bc__poolMap:hover:not(:disabled) .bc__rdArt { opacity: 0.45; }
.bc__poolMap:active:not(:disabled) { transform: translateY(1px); }
.bc__poolMap--on { border-color: var(--live); box-shadow: inset 0 0 0 1px var(--live); }
.bc__poolMap--cued { border-color: var(--take); box-shadow: inset 0 0 0 1px var(--take); }
.bc__poolMap--cued .bc__rdNote { color: var(--take); }
/* banned maps looked disabled and were clickable. Now they are disabled. */
.bc__poolMap:disabled { cursor: not-allowed; }
.bc__poolMap:disabled .bc__rdName { color: rgba(255,255,255,0.45); text-decoration: line-through; }
.bc__poolMap:disabled .bc__rdArt { filter: grayscale(1); opacity: 0.08; }

.bc__lineup {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
  padding: 12px; margin-bottom: 8px; cursor: pointer; color: #fff; font: inherit;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.14);
  transition: background 120ms var(--ease), border-color 120ms var(--ease);
}
.bc__lineup:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.4); }
.bc__lineupName { font-size: 14px; font-weight: 700; }
.bc__lineupNote { font-size: 12px; color: rgba(255,255,255,0.65); }
.bc__moreRow {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
  padding: 13px 12px; cursor: pointer; color: #fff; font: inherit; min-height: 52px;
  background: transparent; border: 0; border-top: 1px solid var(--line);
}
.bc__moreRow:hover { background: rgba(255,255,255,0.07); }
.bc__moreRow--danger { color: #ff9a9a; }
.bc__moreMeta { margin-left: auto; font-family: var(--font-geist-mono), ui-monospace, monospace; font-size: 11px; color: rgba(255,255,255,0.55); }

@media (max-width: 980px) {
  .bc { padding-bottom: 212px; }
  .bc__chips { max-height: 64px; }
  .bc__band, .bc__band--solo { grid-template-columns: 1fr; }
  .bc__centre { border-left: 0; border-right: 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); order: -1; }
  .bc__side { padding: 16px 20px; }
  .bc__grid, .bc__grid--solo { grid-template-columns: 1fr; }
  .bc__col + .bc__col { border-left: 0; border-top: 1px solid var(--line); }
  .bc__standby { width: auto; border-left: 0; border-right: 0; border-top: 1px solid var(--line); }
  /* The columns stack here, so there is no centre left to mirror around: both
     variants collapse to name-first and CT reads like T again. The move
     cluster also stops hiding. A stacked row is a card rather than a broadcast
     line, and a Kick that only exists on hover is a Kick nobody finds — the
     rule that was meant to say so used to lose to the hover block on
     specificity, which is why it says it per variant now. */
  .bc__head--l, .bc__head--r, .bc__row--l, .bc__row--r { grid-template-columns: minmax(0,1fr) auto auto; }
  .bc__head--r .bc__headName { grid-area: 1 / 1; text-align: left; }
  .bc__row--r .bc__who { grid-area: 1 / 1; flex-direction: row; }
  .bc__head--l .bc__stats, .bc__head--r .bc__stats { grid-area: 1 / 2; text-align: right; }
  .bc__row--l .bc__stats, .bc__row--r .bc__stats { grid-area: 1 / 2; text-align: right; }
  .bc__row--r .bc__bar { inset: 0 auto 0 0; background: linear-gradient(to right, var(--barTint), transparent); }
  .bc__row--r.bc__row--moved { box-shadow: inset 3px 0 0 var(--take); }
  .bc__row--r.bc__row--conflict { box-shadow: inset 3px 0 0 var(--bad); }
  .bc__row--l .bc__moves, .bc__row--r .bc__moves {
    grid-area: 1 / 3; justify-self: auto; justify-content: flex-end; flex-direction: row;
    padding-left: 0; padding-right: 0; background: none;
    opacity: 1; pointer-events: auto; transform: none; filter: none;
  }
  .bc__row:hover .bc__player { filter: none; opacity: 1; }
  .bc__meta { margin-left: 0; }
  /* the dock stacks instead of scrolling, and the commit pill sits last so it
     is the thing under the thumb. Nothing here is ever off-screen. */
  .bc__dock { left: 12px; right: 12px; width: auto; transform: none; bottom: max(12px, env(safe-area-inset-bottom)); }
  .bc__bars { flex-direction: column; }
  .bc__pill { justify-content: space-between; }
  .bc__act--hideSm { display: none; }
  .bc__more { display: flex; }
  .bc__apply { flex: 1; align-items: center; }
}

@media (max-width: 700px) {
  .bc__head { display: none; }
  /* Narrower still: the five numbers drop to their own line under the name and
     grow labels, because 46px columns and a name do not both fit. */
  .bc__row--l, .bc__row--r { grid-template-columns: minmax(0,1fr) auto; row-gap: 6px; }
  .bc__row--l .bc__moves, .bc__row--r .bc__moves { grid-area: 1 / 2; }
  .bc__row--l .bc__stats, .bc__row--r .bc__stats {
    grid-area: 2 / 1 / 3 / -1; grid-template-columns: repeat(5, 1fr); text-align: left;
  }
  .bc__stats span::before {
    content: attr(data-l) " "; color: rgba(255,255,255,0.55);
    font-size: 9px; letter-spacing: 0.14em; font-weight: 600;
  }
  .bc__sheet { top: auto; bottom: 0; left: 0; right: 0; width: auto; transform: none; border-radius: 16px 16px 0 0; max-height: 84svh; }
  @keyframes bcsheet { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
}

@media (prefers-reduced-motion: reduce) {
  .bc *, .bc *::after, .bc *::before { animation: none !important; transition-duration: 1ms !important; }
  .bc__prog { transform: scaleX(1); }
}
`;

type Side = "ct" | "t" | "standby";

type Config = {
  preset: string;
  map: string;
  format: string;
  overtime: boolean;
  ctName: string;
  tName: string;
  ctCaptain: string;
  tCaptain: string;
  sides: Record<string, Side>;
};

/** Scalar fields, in the order their chips read. `sides` is diffed per player. */
const FIELDS = ["preset", "map", "format", "overtime", "ctName", "tName", "ctCaptain", "tCaptain"] as const;
type Field = (typeof FIELDS)[number];

/**
 * What each mode actually is. The third pass gated everything on
 * `preset === "competitive"`, which hid seven of twelve connected players in
 * every other mode. Shape decides *structure*; population is never hidden.
 */
const SHAPES: Record<string, { sided: boolean; series: boolean; bench: boolean; overtime: boolean; blurb: string }> = {
  competitive: { sided: true, series: true, bench: true, overtime: true, blurb: "5v5 · MR12" },
  wingman: { sided: true, series: false, bench: true, overtime: true, blurb: "2v2 · short sites" },
  retakes: { sided: true, series: false, bench: true, overtime: false, blurb: "3v4 · site executes" },
  deathmatch: { sided: false, series: false, bench: false, overtime: false, blurb: "free-for-all · instant respawn" },
  practice: { sided: false, series: false, bench: false, overtime: false, blurb: "nades, cheats, bots off" },
};

const ALL_PLAYERS: MockPlayer[] = [...PLAYERS, ...STANDBY];
const FORMATS = ["BO1", "BO3", "BO5"];
const MAP_LABEL = Object.fromEntries(
  [...MAP_POOL, ...SERIES_MAPS].map((m) => [m.name, m.label]),
) as Record<string, string>;

/** Saved lineups. Same twelve friends every Friday — retyping the teams is work. */
const LINEUPS = [
  { id: "friday", name: "Last Friday", note: "Fang vs p4ul · 5v5, vex and Marrow benched",
    ctName: "Team Fang", tName: "Team p4ul", ct: ["1", "2", "3", "4", "5"], t: ["6", "7", "8", "9", "10"] },
  { id: "aim", name: "Aim night", note: "Mixed 6v6, everybody plays",
    ctName: "Blue", tName: "Orange", ct: ["1", "3", "5", "7", "9", "11"], t: ["2", "4", "6", "8", "10", "12"] },
];

/** The live interventions. These are not staged — they happen when pressed. */
const NOW_ACTIONS = [
  { id: "pause", label: "Pause", Icon: Pause, hint: "at the next freeze", rcon: "mp_pause_match" },
  { id: "swap", label: "Swap", Icon: ArrowsLeftRight, hint: "sides, now", rcon: "mp_swapteams" },
  { id: "knife", label: "Knife", Icon: Knife, hint: "restarts the map", rcon: "mp_restartgame 1" },
  { id: "backup", label: "Backup", Icon: ClockCounterClockwise, hint: "restore round 11", rcon: ".restore 11" },
];

const FIELD_LABEL: Record<Field, string> = {
  preset: "Mode", map: "Map", format: "Series", overtime: "Overtime",
  ctName: "CT name", tName: "T name", ctCaptain: "CT captain", tCaptain: "T captain",
};

/** Which staged changes cost the room time, so the dock can say so out loud. */
const HEAVY: Partial<Record<Field, string>> = {
  map: "reloads the map · ~60s, everyone waits",
  preset: "re-execs the config and restarts the map",
};

const INITIAL: Config = {
  preset: "competitive",
  map: MATCH.map,
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

type SheetState =
  | { kind: "pool" }
  | { kind: "more" }
  | { kind: "end" }
  | { kind: "lineups" }
  | { kind: "kick"; player: MockPlayer }
  | { kind: "now"; action: (typeof NOW_ACTIONS)[number] }
  | null;

type RowCtx = {
  preview: Config;
  base: Config;
  program: Config;
  shape: (typeof SHAPES)[string];
  setCaptain: (id: string, side: Side) => void;
  move: (id: string, to: Side) => void;
  kick: (p: MockPlayer) => void;
};

function Stats({ p }: { p: MockPlayer }) {
  return (
    <span className="bc__stats">
      <span className="bc__num" data-l="K">{p.kills}</span>
      <span className="bc__num bc__num--dim" data-l="D">{p.deaths}</span>
      <span className="bc__num" data-l="K/D">{kd(p)}</span>
      <span className="bc__num bc__num--dim" data-l="ADR">{p.adr}</span>
      <span className="bc__num bc__num--dim" data-l="PING">{p.ping}</span>
    </span>
  );
}

/**
 * `nameRight` moves the name block to the end of the row. It is the only
 * difference between the two halves of the board: same markup, same order,
 * opposite edge. CT takes it, because CT's row ends at the centre.
 */
function Head({ name, count, nameRight }: { name: string; count: number; nameRight?: boolean }) {
  return (
    <div className={`bc__head bc__head--${nameRight ? "r" : "l"}`}>
      <span className="bc__headName">{name} · {count}</span>
      <span className="bc__stats">
        <span>K</span><span>D</span><span>K/D</span><span>ADR</span><span>Ping</span>
      </span>
    </div>
  );
}

function Row({ p, side, rank, ctx }: { p: MockPlayer; side: Side; rank?: number; ctx: RowCtx }) {
  const { preview, base, program, shape } = ctx;
  const moved = preview.sides[p.id] !== base.sides[p.id];
  const conflict = moved && program.sides[p.id] !== base.sides[p.id];
  const isCaptain = (side === "ct" ? preview.ctCaptain : preview.tCaptain) === p.id;
  const wasCaptain = (side === "ct" ? base.ctCaptain : base.tCaptain) === p.id;
  return (
    <div
      className={`bc__row bc__row--${side === "ct" ? "r" : "l"}${moved ? " bc__row--moved" : ""}${conflict ? " bc__row--conflict" : ""}`}
    >
      <span className="bc__bar" style={{ width: `${Math.min(100, p.adr)}%` }} aria-hidden />
      <span className="bc__who">
        {rank !== undefined && <span className="bc__rank">{rank}</span>}
        <span className="bc__player">{p.name}</span>
        {side !== "standby" && (
          <button
            type="button"
            className={`bc__cap${isCaptain ? " bc__cap--on" : ""}${isCaptain && !wasCaptain ? " bc__cap--staged" : ""}`}
            aria-pressed={isCaptain}
            aria-label={isCaptain ? `${p.name} is captain` : `Make ${p.name} captain`}
            title={isCaptain ? "Captain" : `Make ${p.name} captain`}
            onClick={() => ctx.setCaptain(p.id, side)}
          >
            C
          </button>
        )}
      </span>
      <Stats p={p} />
      <span className="bc__moves">
        {shape.bench && side !== "standby" && (
          <button className="bc__move" type="button" onClick={() => ctx.move(p.id, "standby")} title={`Bench ${p.name}`}>
            Bench
          </button>
        )}
        {shape.sided && side !== "standby" && (
          <button
            className="bc__move"
            type="button"
            onClick={() => ctx.move(p.id, side === "ct" ? "t" : "ct")}
            title={side === "ct" ? `Move ${p.name} to Terrorists` : `Move ${p.name} to Counter-Terrorists`}
          >
            {side === "ct" ? "T \u25b8" : "\u25c2 CT"}
          </button>
        )}
        <button
          className="bc__move bc__move--now"
          type="button"
          onClick={() => ctx.kick(p)}
          title={`Kick ${p.name} from the server`}
        >
          Kick
        </button>
      </span>
    </div>
  );
}

export default function BroadcastDirection() {
  /** PROGRAM: what the server is running. It moves; that is the whole point. */
  const [program, setProgram] = useState<Config>(INITIAL);
  /** BASE: the program snapshot this preview was built from. Diffs run against it. */
  const [base, setBase] = useState<Config>(INITIAL);
  const [preview, setPreview] = useState<Config>(INITIAL);

  const [phase, setPhase] = useState<"idle" | "applying" | "failed">("idle");
  const [sheet, setSheet] = useState<SheetState>(null);
  const [kicked, setKicked] = useState<string[]>([]);
  const [undoable, setUndoable] = useState<Config | null>(null);
  const [copied, setCopied] = useState(false);
  const [endIn, setEndIn] = useState(5);
  const [toast, setToast] = useState<string | null>(null);
  /** Bumped when the server confirms, purely to re-key the cut so it replays. */
  const [cut, setCut] = useState(0);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const dial = useDialKit(
    "Broadcast",
    {
      stage: { artOpacity: [0.28, 0, 1], veil: [0.92, 0.4, 1], bandPad: [26, 8, 64] },
      type: { scoreSize: [11, 4, 16], teamSize: [28, 14, 48] },
      colour: { ct: "#3d8bfd", t: "#ff9422", live: "#ff4d4d", take: "#ffd166", bad: "#ff5a5a" },
      rows: { rowPad: [11, 2, 24], barOpacity: [0.13, 0, 0.6] },
      /* The unhappy paths, which a mock otherwise never shows you. */
      sim: { rconSilent: false, dockerDown: false, failNextApply: false, applyMs: [1600, 200, 6000] },
    },
    { id: "broadcast-direction", persist: true },
  );

  const roster = useMemo(() => ALL_PLAYERS.filter((p) => !kicked.includes(p.id)), [kicked]);
  const shape = SHAPES[preview.preset] ?? SHAPES.competitive;
  const programShape = SHAPES[program.preset] ?? SHAPES.competitive;
  const nameOf = useCallback((id: string) => roster.find((p) => p.id === id)?.name ?? "nobody", [roster]);

  /* ---------------- the bus ---------------- */

  /**
   * Program moving under a preview is the normal case, not an edge case: MatchZy
   * swaps sides at the half whether or not you were mid-edit. Unstaged fields
   * follow the server silently; staged ones keep your value and go conflicted.
   */
  const mutateProgram = (patch: Partial<Config>) => {
    const next: Config = { ...program, ...patch, sides: { ...program.sides, ...(patch.sides ?? {}) } };
    const nb: Config = { ...base, sides: { ...base.sides } };
    const np: Config = { ...preview, sides: { ...preview.sides } };
    for (const f of FIELDS) {
      if (preview[f] === base[f]) {
        (nb as Record<string, unknown>)[f] = next[f];
        (np as Record<string, unknown>)[f] = next[f];
      }
    }
    for (const p of ALL_PLAYERS) {
      if (preview.sides[p.id] === base.sides[p.id]) {
        nb.sides[p.id] = next.sides[p.id];
        np.sides[p.id] = next.sides[p.id];
      }
    }
    setProgram(next);
    setBase(nb);
    setPreview(np);
  };

  const stagedFields = FIELDS.filter((f) => preview[f] !== base[f]);
  const conflictFields = stagedFields.filter((f) => program[f] !== base[f]);
  const movedIds = roster.filter((p) => preview.sides[p.id] !== base.sides[p.id]).map((p) => p.id);
  const conflictIds = movedIds.filter((id) => program.sides[id] !== base.sides[id]);

  type Chip = {
    key: string; label: string; to: string; note?: string;
    heavy?: boolean; conflict?: string; onDismiss: () => void;
    onKeepMine?: () => void; onTakeServer?: () => void;
  };

  /**
   * The staged diff, in the words the chips use. Derived from two objects rather
   * than a dirty flag per control, so it cannot claim a change that is not there
   * or miss one that is.
   */
  const chips: Chip[] = useMemo(() => {
    const shown = (f: Field, v: Config[Field]): string => {
      if (f === "overtime") return v ? "on" : "off";
      if (f === "map") return MAP_LABEL[v as string] ?? (v as string);
      if (f === "preset") return PRESETS.find((p) => p.id === v)?.label ?? String(v);
      if (f === "ctCaptain" || f === "tCaptain") return nameOf(v as string);
      return String(v);
    };
    const out: Chip[] = FIELDS.filter((f) => preview[f] !== base[f]).map((f) => ({
      key: f,
      label: FIELD_LABEL[f],
      to: shown(f, preview[f]),
      note: HEAVY[f],
      heavy: Boolean(HEAVY[f]),
      conflict: program[f] !== base[f] ? shown(f, program[f]) : undefined,
      onDismiss: () => setPreview((p) => ({ ...p, [f]: base[f] })),
      onKeepMine: () => setBase((b) => ({ ...b, [f]: program[f] })),
      onTakeServer: () => {
        setPreview((p) => ({ ...p, [f]: program[f] }));
        setBase((b) => ({ ...b, [f]: program[f] }));
      },
    }));
    if (movedIds.length) {
      out.push({
        key: "roster",
        label: "Roster",
        to: `${movedIds.length} move${movedIds.length === 1 ? "" : "s"}`,
        note: movedIds.map(nameOf).join(", "),
        conflict: conflictIds.length ? `server moved ${conflictIds.map(nameOf).join(", ")}` : undefined,
        onDismiss: () =>
          setPreview((p) => {
            const sides = { ...p.sides };
            for (const id of movedIds) sides[id] = base.sides[id];
            return { ...p, sides };
          }),
        onKeepMine: () =>
          setBase((b) => {
            const sides = { ...b.sides };
            for (const id of conflictIds) sides[id] = program.sides[id];
            return { ...b, sides };
          }),
        onTakeServer: () => {
          setPreview((p) => {
            const sides = { ...p.sides };
            for (const id of conflictIds) sides[id] = program.sides[id];
            return { ...p, sides };
          });
          setBase((b) => {
            const sides = { ...b.sides };
            for (const id of conflictIds) sides[id] = program.sides[id];
            return { ...b, sides };
          });
        },
      });
    }
    /* Destructive first — the chip you most need to reconsider is not buried. */
    return out.sort((a, b) => Number(Boolean(b.conflict)) - Number(Boolean(a.conflict)) || Number(Boolean(b.heavy)) - Number(Boolean(a.heavy)));
  }, [preview, base, program, movedIds, conflictIds, nameOf]);

  const dirty = chips.length > 0;
  const heavy = chips.find((c) => c.heavy);

  /* ---------------- what would break if this went to air ---------------- */

  const rosterOf = (side: Side) => roster.filter((p) => preview.sides[p.id] === side);
  const ct = rosterOf("ct");
  const t = rosterOf("t");
  const standby = rosterOf("standby");

  const problems = useMemo(() => {
    const out: string[] = [];
    if (!preview.ctName.trim() || !preview.tName.trim()) out.push("A team name is empty.");
    if (shape.sided) {
      if (!ct.length || !t.length) out.push("A side has nobody on it.");
      if (!preview.ctCaptain || !roster.some((p) => p.id === preview.ctCaptain))
        out.push(`${preview.ctName || "CT"} has no captain — nobody can ready up.`);
      if (!preview.tCaptain || !roster.some((p) => p.id === preview.tCaptain))
        out.push(`${preview.tName || "T"} has no captain — nobody can ready up.`);
    }
    if (conflictFields.length || conflictIds.length)
      out.push("The server changed underneath a staged change. Resolve it above.");
    return out;
  }, [preview, shape.sided, ct.length, t.length, roster, conflictFields.length, conflictIds.length]);

  const canApply = dirty && problems.length === 0 && phase !== "applying";

  /* ---------------- applying is a request, not a fact ---------------- */

  const applyMs = Number(dial.sim.applyMs);

  const runApply = useCallback(() => {
    const target = preview;
    const willFail = Boolean(dial.sim.failNextApply);
    setPhase("applying");
    setToast(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (willFail) {
        setPhase("failed");
        return;
      }
      setProgram(target);
      setBase(target);
      setPreview(target);
      setCut((n) => n + 1);
      setPhase("idle");
    }, applyMs);
  }, [preview, dial.sim.failNextApply, applyMs]);

  const discard = () => {
    setUndoable(preview);
    setPreview(base);
    setPhase("idle");
  };

  /* ---------------- editing ---------------- */

  const move = (id: string, to: Side) =>
    setPreview((p) => ({
      ...p,
      sides: { ...p.sides, [id]: to },
      /* A captain who leaves a side stops being its captain — otherwise the badge
         sits in the bench claiming to lead a team. */
      ctCaptain: p.ctCaptain === id && to !== "ct" ? "" : p.ctCaptain,
      tCaptain: p.tCaptain === id && to !== "t" ? "" : p.tCaptain,
    }));

  const setCaptain = (id: string, side: Side) =>
    setPreview((p) => (side === "ct" ? { ...p, ctCaptain: id } : { ...p, tCaptain: id }));

  const stageLineup = (l: (typeof LINEUPS)[number]) => {
    setPreview((p) => {
      const sides = { ...p.sides };
      for (const pl of ALL_PLAYERS) sides[pl.id] = "standby";
      for (const id of l.ct) sides[id] = "ct";
      for (const id of l.t) sides[id] = "t";
      return {
        ...p, sides, ctName: l.ctName, tName: l.tName,
        ctCaptain: l.ct[0] ?? "", tCaptain: l.t[0] ?? "",
      };
    });
    setSheet(null);
  };

  /* ---------------- live interventions ---------------- */

  const fireNow = (action: (typeof NOW_ACTIONS)[number]) => {
    if (action.id === "swap") {
      /* A real halftime swap: players change ends, the team identity and its
         captain go with the name. Staged edits to any of it now conflict. */
      const sides: Record<string, Side> = { ...program.sides };
      for (const id of Object.keys(sides)) {
        if (sides[id] === "ct") sides[id] = "t";
        else if (sides[id] === "t") sides[id] = "ct";
      }
      mutateProgram({ sides, ctName: program.tName, tName: program.ctName, ctCaptain: program.tCaptain, tCaptain: program.ctCaptain });
      setToast("Sides swapped on the server.");
    } else {
      setToast(`Sent ${action.rcon}`);
    }
    setSheet(null);
  };

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (sheet) setSheet(null);
        else if (dirty) discard();
        return;
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canApply) {
        e.preventDefault();
        runApply();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* End match auto-disarms. The third pass armed a red button and waited forever. */
  useEffect(() => {
    if (sheet?.kind !== "end") return;
    const iv = setInterval(() => setEndIn((n) => Math.max(0, n - 1)), 1000);
    const to = setTimeout(() => setSheet(null), 5000);
    return () => { clearInterval(iv); clearTimeout(to); };
  }, [sheet?.kind]);

  useEffect(() => {
    if (!toast) return;
    const to = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(to);
  }, [toast]);

  /* ---------------- derived server condition ---------------- */

  const unknown = Boolean(dial.sim.rconSilent && dial.sim.dockerDown);
  const degraded = Boolean(dial.sim.rconSilent || dial.sim.dockerDown);
  const busLabel =
    phase === "applying" ? "Sending" : phase === "failed" ? "Failed" : unknown ? "Unknown" : dirty ? "Preview" : "On air";
  const busClass =
    phase === "applying" ? " bc__bus--wait" : phase === "failed" ? " bc__bus--bad" : unknown ? " bc__bus--unknown" : dirty ? " bc__bus--pvw" : "";

  const captainName = (id: string) => roster.find((p) => p.id === id)?.name;
  const cueLabel = preview.map !== program.map ? MAP_LABEL[preview.map] : null;
  const leader = [...roster].sort((a, b) => b.kills - a.kills)[0];

  const vars = {
    "--ct": dial.colour.ct,
    "--t": dial.colour.t,
    "--live": dial.colour.live,
    "--take": dial.colour.take,
    "--bad": dial.colour.bad,
    "--veil": String(dial.stage.veil),
    "--bandPad": `${dial.stage.bandPad}px`,
    "--teamSize": String(dial.type.teamSize),
    "--scoreSize": String(dial.type.scoreSize),
    "--rowPad": `${dial.rows.rowPad}px`,
    "--barOpacity": String(dial.rows.barOpacity),
    "--applyMs": `${applyMs}ms`,
  } as React.CSSProperties;

  /* ---------------- rows ---------------- */

  /* Everything the roster rows need. Passed rather than closed over, so the row
     components can live outside render and keep their identity between passes. */
  const ctx: RowCtx = { preview, base, program, shape, setCaptain, move, kick: (p) => setSheet({ kind: "kick", player: p }) };

  return (
    <div className="bc" style={vars}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <DialRoot productionEnabled position="top-right" defaultOpen={false} theme="dark" />

      {/* The stage is PROGRAM. Staging a map used to repaint it, which made
          "preview changes nothing" a lie in the largest possible element. */}
      <div
        className="bc__art"
        style={{ backgroundImage: `url(${mapArt(program.map)})`, opacity: unknown ? dial.stage.artOpacity * 0.4 : dial.stage.artOpacity }}
        aria-hidden
      />
      <div className="bc__veil" aria-hidden />

      <div className="bc__body" inert={phase === "applying" ? true : undefined}>
        <div className="bc__rail">
          <span className={`bc__bus${busClass}`}>{busLabel}</span>
          <span><b>{SERVER.hostname}</b> · {roster.length}/{SERVER.slotsTotal}</span>
          <button
            className="bc__copy"
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(SERVER.connectUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
            title="Copy the connect command"
          >
            <b>{SERVER.ip}:{SERVER.port}</b>
            <Copy size={12} weight="bold" aria-hidden />
            {copied ? "Copied" : "Copy"}
          </button>
          <span className={MATCH.recording ? "bc__rec" : "bc__rec bc__rec--off"} title={MATCH.recording || "No demo running"}>
            {MATCH.recording ? "● Rec" : "Not recording"}
          </span>

          <div className="bc__meta">
            {unknown ? (
              <span className="bc__tagWarn">Docker unreachable · RCON silent · last seen 40s ago</span>
            ) : (
              <>
                <span>CPU <b>{dial.sim.dockerDown ? "—" : `${SERVER.cpuPct}%`}</b></span>
                <span>MEM <b>{dial.sim.dockerDown ? "—" : `${(SERVER.memMb / 1024).toFixed(1)}/${SERVER.memMaxMb / 1024} GB`}</b></span>
                <span>UP <b>{SERVER.uptimeHours}h</b></span>
                <span className={SERVER.vacSecure ? undefined : "bc__tagWarn"}>{SERVER.vacSecure ? "VAC secure" : "VAC off"}</span>
                <span>{SERVER.build}</span>
              </>
            )}
          </div>

        </div>

        <div className={`bc__band${shape.sided ? "" : " bc__band--solo"}`}>
          {cut > 0 && <div key={cut} className="bc__cut" aria-hidden />}

          {shape.sided && (
            <div className="bc__side bc__ct">
              <span className="bc__sideMark" aria-hidden />
              <span className="bc__team">
                <span className="bc__tag">
                  Counter-Terrorists · {ct.length}
                  {captainName(preview.ctCaptain) ? (
                    <span className="bc__capName"> · c {captainName(preview.ctCaptain)}</span>
                  ) : (
                    <span className="bc__tagWarn"> · no captain</span>
                  )}
                </span>
                <span className="bc__nameWrap">
                  <input
                    className={`bc__nameField${preview.ctName !== base.ctName ? (program.ctName !== base.ctName ? " bc__nameField--conflict" : " bc__nameField--staged") : ""}${preview.ctName.trim() ? "" : " bc__nameField--bad"}`}
                    value={preview.ctName}
                    maxLength={24}
                    onChange={(e) => setPreview((v) => ({ ...v, ctName: e.target.value }))}
                    onBlur={(e) => setPreview((v) => ({ ...v, ctName: e.target.value.trim() }))}
                    aria-label="Counter-Terrorist team name"
                    spellCheck={false}
                  />
                  <span className="bc__pencil" aria-hidden><PencilSimple size={14} /></span>
                </span>
              </span>
              <span className="bc__score">{MATCH.ct.score}</span>
            </div>
          )}

          <div className="bc__centre">
            <span className={`bc__live${unknown ? " bc__live--unknown" : ""}`}>
              {!unknown && <span className="bc__dot" aria-hidden />}
              {unknown ? "Condition unknown" : degraded ? "Live · degraded" : dirty ? "Live · staged" : "Live"}
            </span>

            {/* Mode decides what the rest of this column even means — how many
                sides there are, whether a series exists, whether overtime is a
                thing. Only the mode you are on is on screen; the other four are
                one click away, each stating the shape it puts the server in. */}
            <details
              className="bc__mode"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.open = false;
              }}
            >
              <summary
                className={`bc__modeBtn${preview.preset !== base.preset ? (program.preset !== base.preset ? " bc__modeBtn--conflict" : " bc__modeBtn--staged") : ""}`}
              >
                <span className="bc__modeName">
                  {PRESETS.find((p) => p.id === preview.preset)?.label ?? preview.preset}
                </span>
                <span className="bc__modeShape">{SHAPES[preview.preset]?.blurb}</span>
                <span aria-hidden><CaretDown size={12} weight="bold" /></span>
              </summary>
              <div className="bc__modeMenu" role="group" aria-label="Game mode">
                {PRESETS.map((p) => {
                  const on = preview.preset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      className={`bc__modeOpt${on ? " bc__modeOpt--on" : ""}`}
                      onClick={(e) => {
                        setPreview((v) => ({ ...v, preset: p.id }));
                        e.currentTarget.closest("details")?.removeAttribute("open");
                      }}
                    >
                      <span className="bc__modeOptName">{p.label}</span>
                      <span className="bc__modeOptShape">{SHAPES[p.id]?.blurb}</span>
                    </button>
                  );
                })}
              </div>
            </details>

            <button
              type="button"
              className={`bc__mapBtn${cueLabel ? " bc__mapBtn--staged" : ""}`}
              onClick={() => setSheet({ kind: "pool" })}
              title="Change the map"
            >
              {MAP_LABEL[program.map] ?? program.map}
              <span className="bc__caret" aria-hidden><CaretDown size={14} weight="bold" /></span>
            </button>

            {cueLabel && (
              <span className="bc__cue">
                <span className="bc__cueArt" style={{ backgroundImage: `url(${mapArt(preview.map)})` }} aria-hidden />
                Cued · {cueLabel}
                <button
                  className="bc__cueX"
                  type="button"
                  onClick={() => setPreview((p) => ({ ...p, map: base.map }))}
                  aria-label="Drop the cued map"
                >
                  <X size={11} weight="bold" />
                </button>
              </span>
            )}

            <span className="bc__round">
              {programShape.sided ? (
                <>Round {MATCH.round} of {MATCH.maxRounds}{program.overtime ? " · OT if 12-12" : " · draw at 12-12"}</>
              ) : (
                <>{roster.length} connected · {SHAPES[program.preset]?.blurb}</>
              )}
            </span>

            {programShape.series && (
              <span className="bc__pips" aria-label={`${program.format}: ${MATCH.series.wonCt}-${MATCH.series.wonT}, map ${MATCH.series.mapIndex}`}>
                {Array.from({ length: Number(program.format.slice(2)) }).map((_, i) => {
                  const won = MATCH.series.wonCt + MATCH.series.wonT;
                  const state = i < MATCH.series.wonCt ? "ct" : i < won ? "t" : i === won ? "now" : "";
                  return <span key={i} className={`bc__pip${state ? ` bc__pip--${state}` : ""}`} />;
                })}
              </span>
            )}

            {shape.series && (
              <div className="bc__seg" role="group" aria-label="Series length">
                {FORMATS.map((f) => {
                  const on = preview.format === f;
                  const staged = on && f !== base.format;
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
            )}

            {shape.overtime && (
              <button
                type="button"
                role="switch"
                aria-checked={preview.overtime}
                className={`bc__switch${preview.overtime ? " bc__switch--on" : ""}${preview.overtime !== base.overtime ? " bc__switch--staged" : ""}`}
                onClick={() => setPreview((v) => ({ ...v, overtime: !v.overtime }))}
              >
                <span className="bc__track" aria-hidden><span className="bc__knob" /></span>
                Overtime
              </button>
            )}
          </div>

          {shape.sided && (
            <div className="bc__side bc__side--t bc__t">
              <span className="bc__sideMark" aria-hidden />
              <span className="bc__team">
                <span className="bc__tag">
                  Terrorists · {t.length}
                  {captainName(preview.tCaptain) ? (
                    <span className="bc__capName"> · c {captainName(preview.tCaptain)}</span>
                  ) : (
                    <span className="bc__tagWarn"> · no captain</span>
                  )}
                </span>
                <span className="bc__nameWrap">
                  <input
                    className={`bc__nameField${preview.tName !== base.tName ? (program.tName !== base.tName ? " bc__nameField--conflict" : " bc__nameField--staged") : ""}${preview.tName.trim() ? "" : " bc__nameField--bad"}`}
                    value={preview.tName}
                    maxLength={24}
                    onChange={(e) => setPreview((v) => ({ ...v, tName: e.target.value }))}
                    onBlur={(e) => setPreview((v) => ({ ...v, tName: e.target.value.trim() }))}
                    aria-label="Terrorist team name"
                    spellCheck={false}
                  />
                  <span className="bc__pencil" aria-hidden><PencilSimple size={14} /></span>
                </span>
              </span>
              <span className="bc__score">{MATCH.t.score}</span>
            </div>
          )}

          {!shape.sided && (
            <div className="bc__side">
              <span className="bc__team">
                <span className="bc__tag">{PRESETS.find((p) => p.id === preview.preset)?.label} · {shape.blurb}</span>
                <span style={{ fontSize: `calc(${dial.type.teamSize}px)`, fontWeight: 800, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                  {leader ? `${leader.name} leads` : "Nobody connected"}
                </span>
              </span>
              <span className="bc__score">{leader?.kills ?? 0}</span>
            </div>
          )}
        </div>

        {/* The rundown is PROGRAM's series. A cued map marks the tile rather than
            rewriting the strip, and "next" finally has a treatment. */}
        {programShape.series && (
          <div className="bc__rundown">
            <span className="bc__rdLabel">Rundown · {program.format}</span>
            <div className="bc__rdMaps">
              {SERIES_MAPS.map((m) => {
                const cued = preview.map === m.name && m.name !== base.map;
                const state = m.name === program.map ? "live" : m.state;
                return (
                  <div key={m.name} className={`bc__rd bc__rd--${state}${cued ? " bc__rd--cued" : ""}`}>
                    <span className="bc__rdArt" style={{ backgroundImage: `url(${mapArt(m.name)})` }} aria-hidden />
                    <span className="bc__rdName">{m.label}</span>
                    <span className="bc__rdNote">{cued ? "Cued" : m.note}</span>
                  </div>
                );
              })}
            </div>
            <button className="bc__poolBtn" type="button" onClick={() => setSheet({ kind: "pool" })}>
              Change map
              <span className="bc__caret" aria-hidden><CaretDown size={14} weight="bold" /></span>
            </button>
          </div>
        )}

        <div className={`bc__grid${shape.sided ? "" : " bc__grid--solo"}`}>
          {shape.sided ? (
            <>
              <div className="bc__col bc__ctcol">
                <Head name={preview.ctName || "Counter-Terrorists"} count={ct.length} nameRight />
                {ct.map((p) => <Row key={p.id} p={p} side="ct" ctx={ctx} />)}
                {!ct.length && <p className="bc__sbEmpty">Nobody on this side. Move someone across, or off the bench.</p>}
              </div>

              {shape.bench && (
                <div className="bc__standby">
                  <div className="bc__sbHead">
                    <span>Bench · {standby.length}</span>
                    <button className="bc__move" type="button" onClick={() => setSheet({ kind: "lineups" })}>
                      Lineups
                    </button>
                  </div>
                  {standby.length === 0 && (
                    <p className="bc__sbEmpty">Everyone connected is on a side. Bench someone with the button on their row.</p>
                  )}
                  {standby.map((p) => (
                    <div key={p.id} className={`bc__sbRow${preview.sides[p.id] !== base.sides[p.id] ? " bc__row--moved" : ""}`}>
                      <span className="bc__moves">
                        <button className="bc__move" type="button" onClick={() => move(p.id, "ct")} title={`Move ${p.name} to Counter-Terrorists`}>
                          ◂ CT
                        </button>
                      </span>
                      <span className="bc__sbName">{p.name}</span>
                      <span className="bc__moves">
                        <button className="bc__move" type="button" onClick={() => move(p.id, "t")} title={`Move ${p.name} to Terrorists`}>
                          T ▸
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="bc__col bc__tcol">
                <Head name={preview.tName || "Terrorists"} count={t.length} />
                {t.map((p) => <Row key={p.id} p={p} side="t" ctx={ctx} />)}
                {!t.length && <p className="bc__sbEmpty">Nobody on this side. Move someone across, or off the bench.</p>}
              </div>
            </>
          ) : (
            /* Unsided modes: one list of everybody who is actually connected. */
            <div className="bc__col bc__solocol">
              <Head name="Connected" count={roster.length} />
              {[...roster].sort((a, b) => b.kills - a.kills).map((p, i) => (
                <Row key={p.id} p={p} side="standby" rank={i + 1} ctx={ctx} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/*
        The dock. Two pills, because there are two kinds of commitment here and
        the third pass had them 5px apart with no distinction: interventions that
        happen the moment you press them, and edits that sit in preview until you
        apply them. Nothing in here scrolls sideways.
      */}
      <div className="bc__dock">
        {toast && <span className="bc__undo">{toast}</span>}

        {!dirty && undoable && phase === "idle" && (
          <span className="bc__undo">
            Discarded
            <button className="bc__chipFix" type="button" onClick={() => { setPreview(undoable); setUndoable(null); }}>
              Undo
            </button>
            <button className="bc__chipX" type="button" onClick={() => setUndoable(null)} aria-label="Dismiss"><X size={11} weight="bold" /></button>
          </span>
        )}

        {dirty && phase !== "applying" && (
          <div className="bc__chips">
            {chips.map((c) => (
              <span
                key={c.key}
                className={`bc__chip${c.conflict ? " bc__chip--conflict" : c.heavy ? " bc__chip--heavy" : ""}`}
              >
                {c.label} <em>{c.to}</em>
                {c.conflict ? (
                  <>
                    <span className="bc__chipNote">server: {c.conflict}</span>
                    <button className="bc__chipFix" type="button" onClick={c.onKeepMine}>Keep mine</button>
                    <button className="bc__chipFix" type="button" onClick={c.onTakeServer}>Take server</button>
                  </>
                ) : (
                  c.note && <span className="bc__chipNote">{c.note}</span>
                )}
                <button className="bc__chipX" type="button" onClick={c.onDismiss} aria-label={`Drop ${c.label} change`}><X size={11} weight="bold" /></button>
              </span>
            ))}
          </div>
        )}

        <div className="bc__bars">
          <div className="bc__pill bc__nowPill">
            <div className="bc__nowRow">
              <span className="bc__pillTag">Happens now</span>
              {NOW_ACTIONS.map((a, i) => (
                <button
                  key={a.id}
                  className={`bc__act${i > 0 ? " bc__act--hideSm" : ""}`}
                  type="button"
                  onClick={() => setSheet({ kind: "now", action: a })}
                >
                  <span className="bc__actGlyph" aria-hidden><a.Icon size={16} weight="bold" /></span>
                  <span className="bc__actLabel">{a.label}</span>
                  <span className="bc__actSay">{a.label} — {a.hint} · {a.rcon}</span>
                </button>
              ))}
              <button className="bc__act bc__more" type="button" onClick={() => setSheet({ kind: "more" })}>
                <span className="bc__actGlyph" aria-hidden><DotsThree size={18} weight="bold" /></span>
                <span className="bc__actLabel">More</span>
                <span className="bc__actSay">More — swap, knife, backup, end</span>
              </button>
              <button className="bc__act bc__act--danger bc__act--hideSm" type="button" onClick={() => { setEndIn(5); setSheet({ kind: "end" }); }}>
                <span className="bc__actGlyph" aria-hidden><Stop size={16} weight="fill" /></span>
                <span className="bc__actLabel">End match</span>
                <span className="bc__actSay">End match — drops the series, the panel keeps the stats</span>
              </button>
            </div>
            <span className="bc__nowSay">
              {dirty
                ? `${chips.length} change${chips.length === 1 ? "" : "s"} staged · nothing has reached the server`
                : "Point at anything to see what it does."}
            </span>
          </div>

          {phase === "applying" && (
            <div className="bc__pill bc__progWrap">
              <span className="bc__pillTag">Applying</span>
              <span className="bc__commitCopy">
                <span className="bc__commitLine">Sending {chips.length} change{chips.length === 1 ? "" : "s"} to the server…</span>
                <span className="bc__commitSub">
                  {heavy ? "The map is reloading — this takes about a minute." : "Waiting for RCON to acknowledge."}
                </span>
              </span>
              <span className="bc__prog" aria-hidden />
            </div>
          )}

          {phase === "failed" && (
            <div className="bc__pill bc__pill--bad">
              <span className="bc__pillTag">Failed</span>
              <span className="bc__commitCopy">
                <span className="bc__commitLine">The server did not acknowledge.</span>
                <span className="bc__commitSub bc__commitSub--bad">Nothing changed. Your {chips.length} change{chips.length === 1 ? " is" : "s are"} still staged.</span>
              </span>
              <button className="bc__discard" type="button" onClick={() => setPhase("idle")}>Leave staged</button>
              <button className="bc__apply" type="button" onClick={runApply}>
                <span className="bc__applyLabel">Retry</span>
              </button>
            </div>
          )}

          {dirty && phase === "idle" && (
            <div className="bc__pill bc__pill--commit">
              <span className="bc__pillTag">Staged</span>
              <span className="bc__commitCopy">
                <span className="bc__commitLine">
                  {problems.length ? problems[0] : "Nothing has reached the server yet."}
                </span>
                <span className={`bc__commitSub${problems.length ? " bc__commitSub--bad" : ""}`}>
                  {problems.length > 1 ? `and ${problems.length - 1} more to fix` : "Edits sit here until you apply them."}
                </span>
              </span>
              <button className="bc__discard" type="button" onClick={discard}>Discard</button>
              <button className="bc__apply" type="button" onClick={runApply} disabled={!canApply}>
                <span className="bc__applyLabel">
                  Apply {chips.length} change{chips.length === 1 ? "" : "s"}
                  <span className="bc__kbd">⌘↵</span>
                </span>
                <span className="bc__applyHint">
                  {heavy ? heavy.note : "applies immediately, nobody is dropped"}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- sheets ---------------- */}

      {sheet && <div className="bc__scrim" onClick={() => setSheet(null)} aria-hidden />}

      {sheet?.kind === "pool" && (
        <div className="bc__sheet" role="dialog" aria-modal aria-label="Change the map">
          <div className="bc__sheetHead">
            <div className="bc__sheetTitle">Change the map</div>
            <p className="bc__sheetSub">
              Picking one cues it. It does not load until you apply — and loading it takes about a
              minute while the server downloads and everyone waits in place.
            </p>
          </div>
          <div className="bc__sheetBody">
            <div className="bc__poolGrid">
              {MAP_POOL.map((m) => {
                const banned = m.state === "banned";
                const on = m.name === program.map;
                const cued = m.name === preview.map && m.name !== base.map;
                const played = SERIES_MAPS.find((s) => s.name === m.name)?.state === "done" && !on;
                return (
                  <button
                    key={m.name}
                    type="button"
                    disabled={banned}
                    title={banned ? `Banned by ${m.by} in the veto` : undefined}
                    className={`bc__poolMap${on ? " bc__poolMap--on" : ""}${cued ? " bc__poolMap--cued" : ""}`}
                    onClick={() => { setPreview((p) => ({ ...p, map: m.name })); setSheet(null); }}
                  >
                    <span className="bc__rdArt" style={{ backgroundImage: `url(${mapArt(m.name)})` }} aria-hidden />
                    <span className="bc__rdName">{m.label}</span>
                    <span className="bc__rdNote">
                      {on ? "On air" : cued ? "Cued" : banned ? `Banned · ${m.by}` : played ? "Already played" : m.state === "decider" ? "Decider" : `Pick · ${m.by}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="bc__sheetFoot">
            <span className="bc__count">Banned maps stay in the veto. Unban one by re-running the veto.</span>
            <span className="bc__sheetSpacer" />
            <button className="bc__btn" type="button" onClick={() => setSheet(null)}>Close</button>
          </div>
        </div>
      )}

      {sheet?.kind === "lineups" && (
        <div className="bc__sheet" role="dialog" aria-modal aria-label="Saved lineups">
          <div className="bc__sheetHead">
            <div className="bc__sheetTitle">Lineups</div>
            <p className="bc__sheetSub">The same twelve people most Fridays. Picking one stages the whole draft — names, sides and captains — as a single change you can still review before it goes on air.</p>
          </div>
          <div className="bc__sheetBody">
            {LINEUPS.map((l) => (
              <button key={l.id} className="bc__lineup" type="button" onClick={() => stageLineup(l)}>
                <span>
                  <span className="bc__lineupName">{l.name}</span>
                  <br />
                  <span className="bc__lineupNote">{l.note}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="bc__sheetFoot">
            <span className="bc__sheetSpacer" />
            <button className="bc__btn" type="button" onClick={() => setSheet(null)}>Close</button>
          </div>
        </div>
      )}

      {sheet?.kind === "more" && (
        <div className="bc__sheet" role="dialog" aria-modal aria-label="Server actions">
          <div className="bc__sheetHead">
            <div className="bc__sheetTitle">Happens now</div>
            <p className="bc__sheetSub">None of these are staged. They reach the server the moment you press them.</p>
          </div>
          <div className="bc__sheetBody" style={{ padding: 0 }}>
            {NOW_ACTIONS.map((a) => (
              <button key={a.id} className="bc__moreRow" type="button" onClick={() => setSheet({ kind: "now", action: a })}>
                <span className="bc__actGlyph" aria-hidden><a.Icon size={16} weight="bold" /></span>
                <span>
                  <span className="bc__actLabel">{a.label}</span>
                  <br />
                  <span className="bc__actHint">{a.hint}</span>
                </span>
                <span className="bc__moreMeta">{a.rcon}</span>
              </button>
            ))}
            <button className="bc__moreRow bc__moreRow--danger" type="button" onClick={() => { setEndIn(5); setSheet({ kind: "end" }); }}>
              <span className="bc__actGlyph" aria-hidden><Stop size={16} weight="fill" /></span>
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
        <div className="bc__sheet" role="dialog" aria-modal aria-label={sheet.action.label}>
          <div className="bc__sheetHead">
            <div className="bc__sheetTitle">{sheet.action.label}?</div>
            <p className="bc__sheetSub">
              {sheet.action.id === "pause" && `Freezes the match at the next round break. ${roster.length} players stay connected.`}
              {sheet.action.id === "swap" && `Puts ${program.ctName} on T and ${program.tName} on CT immediately, mid-round.`}
              {sheet.action.id === "knife" && `Restarts ${MAP_LABEL[program.map]} for a knife round. The current score — ${MATCH.ct.score}-${MATCH.t.score} — is lost.`}
              {sheet.action.id === "backup" && "Rewinds the match to the start of round 11. Rounds 11 and 12 are replayed."}
            </p>
            <code className="bc__rcon">rcon {sheet.action.rcon}</code>
          </div>
          <div className="bc__sheetFoot">
            <button className="bc__btn" type="button" onClick={() => setSheet(null)}>Cancel</button>
            <span className="bc__sheetSpacer" />
            <button className="bc__btn" type="button" onClick={() => fireNow(sheet.action)}>
              {sheet.action.label} now
            </button>
          </div>
        </div>
      )}

      {sheet?.kind === "kick" && (
        <div className="bc__sheet" role="dialog" aria-modal aria-label={`Kick ${sheet.player.name}`}>
          <div className="bc__sheetHead">
            <div className="bc__sheetTitle">Kick {sheet.player.name}?</div>
            <p className="bc__sheetSub">
              Removes them from the server right now. They can reconnect with the same address unless
              you ban them, and their {sheet.player.kills} kills stay on the scoreboard for this map.
            </p>
            <code className="bc__rcon">rcon kickid {sheet.player.id} &quot;kicked from the panel&quot;</code>
          </div>
          <div className="bc__sheetFoot">
            <button className="bc__btn" type="button" onClick={() => setSheet(null)}>Cancel</button>
            <span className="bc__sheetSpacer" />
            <button
              className="bc__btn bc__btn--danger"
              type="button"
              onClick={() => {
                setKicked((k) => [...k, sheet.player.id]);
                setToast(`${sheet.player.name} was kicked.`);
                setSheet(null);
              }}
            >
              Kick {sheet.player.name}
            </button>
          </div>
        </div>
      )}

      {/*
        End match. The third pass armed and fired the same 1-2mm of screen and
        deleted its own warning below 980px. Here the stakes are live numbers,
        the confirm is not where the trigger was, and it cancels itself.
      */}
      {sheet?.kind === "end" && (
        <div className="bc__sheet" role="dialog" aria-modal aria-label="End the match">
          <div className="bc__sheetHead">
            <div className="bc__sheetTitle">End the match?</div>
            <p className="bc__sheetSub">
              {programShape.series
                ? `Ends the ${program.format} at ${MAP_LABEL[program.map]}, round ${MATCH.round}, with ${program.ctName} ahead ${MATCH.ct.score}-${MATCH.t.score}. The series result is discarded.`
                : `Ends the current ${PRESETS.find((p) => p.id === program.preset)?.label} session on ${MAP_LABEL[program.map]}.`}
              {" "}All {roster.length} connected players drop to warmup. The demo currently recording is kept.
            </p>
            <code className="bc__rcon">rcon .forceend</code>
          </div>
          <div className="bc__sheetFoot">
            <button className="bc__btn" type="button" onClick={() => setSheet(null)}>Keep playing</button>
            <span className="bc__sheetSpacer" />
            <span className="bc__count">cancels in {endIn}s</span>
            <button
              className="bc__btn bc__btn--danger"
              type="button"
              onClick={() => { setToast("Match ended."); setSheet(null); }}
            >
              End it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
