---
name: sidearm
description: A broadcast gallery for a self-hosted CS2 server — a lit stage over the running map, where amber means not yet and the scoreboard is the control surface.
colors:
  # --- the stage (app/broadcast.css, scoped under .bc) ---
  stage: "#06070a"
  ink: "#ffffff"
  ink-strong: "rgba(255,255,255,0.86)"
  ink-control: "rgba(255,255,255,0.72)"
  ink-quiet: "rgba(255,255,255,0.62)"
  ink-label: "rgba(255,255,255,0.55)"
  ink-faint: "rgba(255,255,255,0.45)"
  surface-veil: "rgba(255,255,255,0.02)"
  surface-rest: "rgba(255,255,255,0.05)"
  surface-hover: "rgba(255,255,255,0.13)"
  line: "rgba(255,255,255,0.09)"
  edge: "rgba(255,255,255,0.16)"
  edge-strong: "rgba(255,255,255,0.4)"
  # --- the four floating surfaces ---
  dock: "rgba(12,14,19,0.94)"
  pill: "rgba(12,14,19,0.88)"
  sheet: "rgba(14,16,22,0.98)"
  menu: "#0b0d12"
  scrim: "rgba(4,5,8,0.68)"
  # --- shade: black at alpha, the material regions are darkened with ---
  shade-region: "rgba(0,0,0,0.3)"
  shade-cast: "rgba(0,0,0,0.95)"
  # --- state, the only colour with a job ---
  ct: "#3d8bfd"
  t: "#ff9422"
  live: "#ff4d4d"
  take: "#ffd166"
  bad: "#ff5a5a"
  bad-ink: "#ff9a9a"
  bad-lift: "#ffb4b4"
  on-ink: "#06070a"
  on-take: "#0a0a0a"
  on-bad: "#14070a"
  # --- the shadcn layer (app/globals.css, .dark — forced, the only theme) ---
  background: "#06070a"
  foreground: "oklch(0.985 0 0)"
  card: "oklch(1 0 0 / 5%)"
  popover: "#0b0d12"
  primary: "oklch(0.985 0 0)"
  primary-foreground: "oklch(0.205 0 0)"
  muted: "oklch(0.26 0 0)"
  muted-foreground: "oklch(0.708 0 0)"
  border: "oklch(1 0 0 / 9%)"
  input: "oklch(1 0 0 / 16%)"
  ring: "oklch(1 0 0)"
  destructive: "oklch(0.68 0.19 25)"
  ok: "oklch(0.75 0.16 152)"
  warn: "oklch(0.8 0.14 78)"
  danger: "oklch(0.7 0.18 24)"
  info: "oklch(0.72 0.14 255)"
  pending: "oklch(0.8 0.13 76)"
  unknown: "oklch(0.708 0 0)"
  team-ct: "#3d8bfd"
  team-t: "#ff9422"
  chart-1: "oklch(0.7 0.15 258)"
  chart-2: "oklch(0.72 0.14 165)"
  chart-3: "oklch(0.78 0.14 65)"
  chart-4: "oklch(0.7 0.17 305)"
  chart-5: "oklch(0.72 0.12 200)"
typography:
  score:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "clamp(48px, 11vw, 132px)"
    fontWeight: 800
    lineHeight: 0.8
    letterSpacing: "-0.05em"
    fontFeature: "tabular-nums"
  team:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  map:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "clamp(20px, 2.6vw, 34px)"
    fontWeight: 800
    letterSpacing: "-0.02em"
  sheet-title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 800
    letterSpacing: "-0.01em"
  player:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  row:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    fontFeature: "tabular-nums"
  action:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.02em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.12em"
  micro:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    letterSpacing: "0.18em"
  tick:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "9px"
    fontWeight: 800
    letterSpacing: "0.1em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    letterSpacing: "0"
rounded:
  none: "0"
  chip: "9px"
  act: "10px"
  pill: "15px"
  sheet: "16px"
  dot: "99px"
spacing:
  hair: "4px"
  tight: "7px"
  control: "9px"
  row: "12px"
  edge: "16px"
  band: "26px"
  column: "28px"
components:
  apply:
    backgroundColor: "{colors.take}"
    textColor: "{colors.on-take}"
    rounded: "{rounded.act}"
    padding: "9px 18px"
    height: "44px"
    typography: "{typography.action}"
  apply-disabled:
    backgroundColor: "rgba(255,255,255,0.14)"
    textColor: "{colors.ink-label}"
    rounded: "{rounded.act}"
    padding: "9px 18px"
  act:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.act}"
    padding: "10px 14px"
    height: "44px"
    typography: "{typography.action}"
  act-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.ink}"
  act-danger:
    backgroundColor: "transparent"
    textColor: "{colors.bad-ink}"
    rounded: "{rounded.act}"
    padding: "10px 14px"
  rail-button:
    backgroundColor: "{colors.surface-rest}"
    textColor: "rgba(255,255,255,0.82)"
    rounded: "{rounded.none}"
    padding: "4px 9px"
    typography: "{typography.label}"
  rail-button-danger:
    backgroundColor: "{colors.surface-rest}"
    textColor: "{colors.bad}"
    rounded: "{rounded.none}"
    padding: "4px 9px"
  segment:
    backgroundColor: "transparent"
    textColor: "{colors.ink-control}"
    rounded: "{rounded.none}"
    padding: "7px 13px"
    typography: "{typography.label}"
  segment-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.none}"
    padding: "7px 13px"
  segment-staged:
    backgroundColor: "{colors.take}"
    textColor: "{colors.on-take}"
    rounded: "{rounded.none}"
    padding: "7px 13px"
  chip:
    backgroundColor: "{colors.dock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "5px 6px 5px 10px"
    typography: "{typography.label}"
  sheet-button:
    backgroundColor: "rgba(255,255,255,0.06)"
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
    padding: "11px 16px"
    height: "44px"
    typography: "{typography.action}"
  sheet-button-danger:
    backgroundColor: "{colors.bad}"
    textColor: "{colors.on-bad}"
    rounded: "{rounded.chip}"
    padding: "11px 16px"
  input:
    backgroundColor: "{colors.surface-rest}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "8px 11px"
    typography: "{typography.action}"
  input-focus:
    backgroundColor: "rgba(255,255,255,0.08)"
    textColor: "{colors.ink}"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.ink-quiet}"
    rounded: "{rounded.none}"
    padding: "6px 10px"
    typography: "{typography.label}"
  move:
    backgroundColor: "rgba(255,255,255,0.1)"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "7px 9px"
    height: "32px"
    typography: "{typography.micro}"
---

# Design System: sidearm

## Overview

**Creative North Star: "The Gallery"**

sidearm is a broadcast gallery, not an admin panel. A gallery is the room a live
show is cut from: one lit stage in a dark room, two buses — what is on air and
what you are building — and a bank of controls whose whole job is to make the
difference between those two obvious at a glance. The panel's dashboard is that
stage. The running map is the background of every page, dimmed almost to black
under a veil; the scoreboard sits on top of it at the size a scoreboard is worth;
and every edit lands in preview and changes nothing until you cut it to air.

Colour is the state vocabulary and nothing else. Five hues carry meaning — CT
blue, T orange, on-air red, staged amber, danger red — and everything else is
white at some alpha over the stage. Surfaces are made of light rather than paint:
a control is `rgba(255,255,255,0.05)` with a `0.16` hairline, a card is white at
5%, and the ground under all of it is the same `#06070a` the stage uses, so a
shadcn `Card` and a `.bc__pill` can share a screen without one of them reading as
a slab dropped on the other. There are no rounded corners in the world itself:
radius appears only on things that float free of the stage — the dock pill, a
sheet, a toast.

Two worlds coexist on purpose, and this is the single most important thing to
know before changing anything. The **stage** (`.bc`, `app/broadcast.css`) is for
`/dashboard`: a match you watch and change under time pressure, at stadium scale.
The **document** (plain shadcn cards inside the stage's reading column) is for
`/settings` and `/history`: things you read carefully and change twice a year.
Rendering settings at stadium scale would be a costume. A reader who assumes
everything should be `.bc` will "fix" the wrong half.

**Key Characteristics:**
- One theme, forced dark (`forcedTheme="dark"`); the light tokens exist only because the shadcn surfaces are built out of them.
- Square by default (`--radius: 0rem`), curved only where something floats.
- Colour spent only on state; the rest is white at a measured alpha.
- The map you are on is the wallpaper, at 28% opacity under a two-stop veil.
- Amber is the whole commitment model: it means "staged, not on air".
- Every control has hover, `:active` depression and one shared focus ring.

## Colors

A blue-black field with the live map showing through it, and five hues that each
mean exactly one thing.

### Primary
- **Staged Amber** (`take`): the commitment model made visible. Every pending edit anywhere in the panel wears it — a staged mode button's border, a moved player's name, the cue thumbnail for a map that has not loaded, the Apply button's fill, the progress bar under an apply in flight. It is the loudest colour on the stage because it is the only one that means *you have not done this yet*.
- **Broadcast White** (`ink`): the working colour. Labels, values, the score, the active segment's fill. Everything that is not state is white at one of six alphas.

### Secondary
- **CT Blue** (`ct`) and **T Orange** (`t`): the two sides. Taken from CS2 itself, not chosen — which is why the same two hex values are also `--team-ct` / `--team-t` in the shadcn layer, so a scoreboard drawn by a chart and one drawn by `.bc__side` agree. They paint the side marks (with a 40px glow), the tags, the round pips and the per-row meter tint.

### Tertiary
- **On-Air Red** (`live`): the bus when the server is running, the recording indicator, the left edge of the map currently being played. Reserved for *this is happening now*.
- **Fault Red** (`bad`): a crash, a conflict, a destructive confirm, a health value over its ceiling. Distinct from on-air red by one step of hue and lightness, and never used for anything routine. Its text-on-dark form is **Fault Pink** (`bad-ink`), because full-saturation red on near-black is a reading problem, not a signal problem, and **Lifted Pink** (`bad-lift`) is that rung one step brighter — the hover state of a danger action, and the body colour of the `.bc__issues` panel, where 12px prose sits on a red tint and needs the extra separation.

### Neutral
- **Stage** (`stage` / `background`): the ground everywhere, in both stylesheets. Not a grey — a blue-black, so the map art under the veil stays warm against it.
- **The ink ladder** (`ink-strong` 0.86 → `ink-control` 0.72 → `ink-quiet` 0.62 → `ink-label` 0.55 → `ink-faint` 0.45): five rungs of white for five jobs — a value you read, a control's resting label, secondary prose, a column header, a hint you are not meant to read yet.
- **The surface ladder** (`surface-veil` 0.02 → `surface-rest` 0.05 → `surface-hover` 0.13): a control at rest, a control under the pointer, and a region that is only slightly lit.
- **The border ladder** (`line` 0.09 → `edge` 0.16 → `edge-strong` 0.4): a structural hairline between regions, a control's own edge, and that edge on hover.
- **The shade ladder** (`0.15 / 0.22 / 0.25 / 0.30 / 0.42 / 0.45` black): the one material that is neither white nor a state. Regions of the stage do not *lighten* to separate themselves — they darken, because what is behind them is a photograph and a region has to hold small text over it. The RCON echo block is the deepest at 0.45 (it is a window onto the machine, not a region of the stage), then the rail at 0.42, the rundown 0.30, the bench 0.25, the round strip 0.22, and the veil's first stop 0.15. **Cast shade** (`0.90` / `0.95`) is a different job: it is what the four lift shadows are made of, and it never appears as a fill.
- **The floating surfaces** (`dock` 0.94, `pill` 0.88, `sheet` 0.98, `menu` opaque): near-black at descending transparency, chosen by how far the thing floats from the stage. A dropdown menu is fully opaque because a menu you can read the roster through is not a menu.

### Named Rules
**The Amber Means Not Yet Rule.** `#ffd166` is reserved for staged, un-applied state. If it is on the server already, it is not amber. One colour across the whole page answers "is this what the server is doing?" — border, text, row edge, chip, Apply fill, all the same hue.

**The Absence Is Not A State Rule.** "We do not know" gets its own treatment — dim white plus a dashed border (`.bc__switch--unknown`, `.bc__bus--unknown`) — and is never dressed as either the reassuring answer or the alarming one. A cvar the server has not answered for must not be drawn as off.

**The Regions Darken, Controls Lighten Rule.** A *control* is white at low alpha over the stage. A *region* — the rail, the rundown, the bench, the round strip — is black at low alpha, because it has to hold 10px text over the map art and lightening it would only wash the photograph into the type. Getting this backwards is the fastest way to make a new strip look pasted on.

**The Light, Not Paint Rule.** Surfaces above the stage are white at low alpha, never a mixed grey. This is what lets a shadcn `Card` (`oklch(1 0 0 / 5%)`) and a `.bc__pill` sit on the same screen and read as the same material.

**The Sides Are CS2's Rule.** CT blue and T orange are the game's colours, carried verbatim into both stylesheets. Do not re-pick them for contrast; if a chart needs a third series, take it from `chart-1..5`.

## Typography

**Display / Body Font:** Geist (`--font-geist-sans`, with `system-ui, sans-serif`)
**Mono Font:** Geist Mono (`--font-geist-mono`, with `ui-monospace, monospace`)

**Character:** One family doing two voices. Below 12px it is a broadcast lower
third — uppercase, heavily tracked (0.10–0.22em), 600–800 weight, short. At and
above 13px it is plain prose at normal tracking. There is no middle register, and
that gap is what makes the stage read as captions over a picture rather than as a
form. Mono is not a style; it appears only where the text is literally machine
text — a connect string, an RCON command, a round limit, a keyboard shortcut.

### Hierarchy
- **Score** (800, `clamp(48px, 11vw, 132px)`, line-height 0.8, tracking -0.05em, tabular): the two numbers in the band. The largest thing on any screen in the product, by a factor of four.
- **Team** (800, 28px via `--teamSize`, uppercase, tracking -0.02em): the side names, whether editable (`.bc__nameField`) or read-only (`.bc__nameRead`) — deliberately the same size, so losing MatchZy does not resize the band.
- **Map** (800, `clamp(20px, 2.6vw, 34px)`, uppercase): the map button in the centre column. It is a control at headline size, which is the point.
- **Sheet Title** (800, 19px, tracking -0.01em): the one heading inside a sheet.
- **Player** (700, 15px) / **Row** (700, 14px, tabular): a roster name, and the map names, bench names and stat values under it.
- **Action** (600, 13px, tracking 0.02em): dock buttons, sheet buttons, inputs. The largest thing you click.
- **Body** (400, 13px, line-height 1.5): sheet prose. The only place in the stage with a real line-height.
- **Meta** (12px): counts, the round line, timestamps.
- **Label** (600, 11px, tracking 0.12–0.14em, uppercase): the rail, nav links, tags, the status line under the dock. The workhorse.
- **Micro** (700, 10px, tracking 0.16–0.20em, uppercase): column headers, pill tags, section tags — text that names a region rather than saying anything.
- **Tick** (800, 9px, tracking 0.10em): one-to-three-character badges only — a round number, a captain badge, a stat abbreviation on a phone.
- **Mono** (12px, tracking 0): connect string, RCON echo, round limit, `⌘K`.

### Named Rules
**The Two Registers Rule.** At 11px and below, text is uppercase, tracked ≥0.10em and weight ≥600. At 13px and above it is sentence case at normal tracking. Nothing lives between those registers; adding a tracked 15px label would put the stage in a third voice it does not have.

**The Tick Is A Badge Rule.** 9px is legal only for glyph badges of one to three characters at weight 800 on a high-contrast fill. It is never prose, never a hint, never a value someone has to read at speed.

**The Numbers Don't Twitch Rule.** Anything that updates in place — scores, ping, K/D, CPU, elapsed timers, the round limit — carries `font-variant-numeric: tabular-nums` (or the `.tabular` utility outside the stage). A poll must never reflow the layout.

## Layout

The stage is a column: a wrapping rail across the top, then the band, then
optional strips (rundown, rounds), then the roster grid, then the health hairline
— with a fixed dock floating over the bottom.

**The band and the grid share one three-column geometry** (`1fr auto 1fr`): CT on
the left, a bordered centre column (280–470px) carrying the live indicator, map,
mode, round limit and cue, T on the right. When a mode has no sides, both collapse
to `1fr` (`--solo`) rather than being bent with overrides.

**The roster mirrors, but only about edges.** `.bc__row--l` puts the name at the
start of the row and `.bc__row--r` at the end; every child of the row is placed
explicitly by grid area in both, so nothing depends on document order. The five
stat columns keep their order on both sides (K is first everywhere) — what
mirrors is which edge a block sits against and which side of its 46px a digit
hugs, so a number leans back toward the player it belongs to. The name lane is a
fixed `15rem` track, not "whatever is left", because the header labels and the row
values only stay locked to each other if the track between the numbers and the
column edge is the same width in both.

**Spacing rhythm** is tight and mostly odd: 4 / 7 / 9 / 12 / 16 for gaps and
control padding, 26–32px for the band's breathing room, 28px between a side mark
and its team. Region padding is `9px 16px` (rail), `12px 16px` (health, rounds),
`14px 16px 20px` (roster column).

**Reading routes** (`/settings`, `/history`) get `.bc__stage` / `.bc__stageIn`:
one centred column capped at **1180px**, `20px 16px` padding, with a bottom pad of
`calc(4.5rem + env(safe-area-inset-bottom))` so the last control on a scrolling
page is never under the fixed bar. The dock's surface reserves **184px** on
`/dashboard` (212px under 980px) via `.bc--docked`.

**Breakpoints** are 980px and 700px, plus one 768px step for the reading column.
At 980px the band and the grid stack, the centre column jumps to the top
(`order: -1`), the roster un-mirrors to name-first on both sides, the move cluster
stops hiding, and the dock becomes a stacked full-width column with Apply under
the thumb. At 700px the roster header disappears and the five stats drop to their
own row with generated labels (`content: attr(data-l)`), the nav scrolls sideways
rather than wrapping, and sheets become bottom sheets.

### Named Rules
**The Dock Owns The Bottom Rule.** The dock is fixed and centred at `min(1180px, 100vw - 28px)`; any surface that carries it declares `.bc--docked` and pays for the space. Nothing in the dock scrolls horizontally — below 980px it stacks, because an Apply button 400px off-screen is an Apply button that does not exist.

**The Explicit Placement Rule.** Every child of a mirrored row is placed by grid area in both variants. Never mirror by re-placing some children and leaving the rest to auto-placement; the stats track, the header spacer and the hover overlay all resolve against a cursor that moves when any one of them does.

## Elevation & Depth

Depth comes from three things, in this order: **light**, **blur**, and only then
shadow. The stage is a photograph at 28% opacity under a two-stop veil
(a radial darkening plus a `180deg` gradient to 98% black at 62%), which puts
everything else in front of a real background rather than on a flat panel.
Regions above it are separated by hairlines, not by elevation. Shadows exist for
exactly two jobs: making a thing that floats look like it floats, and making a
state colour glow.

### Shadow Vocabulary
- **Glow** (`box-shadow: 0 0 22px -4px <state>`): on the bus chip, in whichever state colour it is currently reporting. The only decorative-looking shadow in the system, and it is doing state work.
- **Side mark glow** (`0 0 40px 2px var(--ct|--t)`): the 6px rounded bar beside each team name, bleeding its side's colour into the band.
- **Dock lift** (`0 22px 60px -22px rgba(0,0,0,0.95), 0 1px 0 rgba(255,255,255,0.07) inset`): the control pill. A long soft drop plus a one-pixel top highlight — a physical object over a picture.
- **Menu lift** (`0 24px 60px -20px rgba(0,0,0,0.9)`): the mode dropdown.
- **Sheet lift** (`0 44px 100px -34px rgba(0,0,0,0.95)`): the largest, for the thing that takes the whole screen's attention.
- **Edge marks** (`inset 3px 0 0 <state>`): not elevation at all — a state stripe on the leading edge of a rundown card or a roster row (mirrored to `inset -3px` on the right-hand column, and un-mirrored again when the columns stack).

Blur is structural here: `backdrop-filter: blur(12px)` on the dock chips, undo bar,
sheets and toasts; `blur(20px) saturate(1.3)` on the control pill; and a `blur()`
transition as the depth swap that reveals a row's move cluster while the name
behind it blurs and dims.

### Named Rules
**The Lit-From-Behind Rule.** Depth is light and blur before it is shadow. A new surface inside the stage gets a hairline and a lighter fill, not a drop shadow. Shadows belong to the four things that float free: the dock pill, the mode menu, sheets, toasts.

**The Portal Parity Rule.** Anything that renders outside `.bc` — sonner toasts, Radix `Sheet`, `AlertDialog` — must be given the dock's surface (`rgba(12,14,19,0.94)`, hairline `rgba(255,255,255,0.2)`, `blur(12px)`, scrim `rgba(3,4,6,0.72)`), because none of the world's variables reach it. Those overrides live at the end of `app/globals.css`, and the toaster's own colours in `components/ui/sonner.tsx`, because sonner sets them inline where no stylesheet can outrank them.

## Shapes

**The world is rectangular.** `--radius: 0rem` globally, and every `.bc__` control
— buttons, inputs, chips, segments, badges, map tiles — is a hard-cornered box. A
rounded shadcn `Button` next to a square `.bc__act` is the one detail that gives
away that two systems are on screen, which is why the shadcn radius is zeroed
rather than tuned.

Radius appears only on things that leave the surface: the control pill (15px),
the buttons inside it (10px), a sheet button (9px), a sheet (16px, and
`16px 16px 0 0` as a bottom sheet), and true circles (`99px`) for the pulsing live
dot, the switch track and knob, and the side marks.

Borders carry most of the form language. A **solid** hairline is structure. A
**dashed** rule means not-committed: an editable team name (`1px dashed
rgba(255,255,255,0.42)` that solidifies on hover and turns amber on focus), the
round-limit input, an unknown switch, the "next" map's 3px repeating-gradient
stripe, and the absent-feature notice. Line-through means unavailable — a banned
map, a dead practice command.

### Named Rules
**The Square Rule.** In-stage controls have zero radius. If something has a corner radius, it should be floating over the stage and casting one of the four lift shadows; if it is not, the radius is wrong.

**The Dashed Means Not-Yet Rule.** Dashed borders mean editable-but-unchanged, unknown, or upcoming. They never mean disabled — disabled is `opacity: 0.4–0.55` plus `cursor: not-allowed`, and a disabled control must actually be `disabled` rather than merely looking it.

## Components

Everything in the stage is a real control with a surface, a hover, a press and a
shared focus ring: `.bc button:focus-visible, .bc input:focus-visible { outline:
2px solid #fff; outline-offset: 2px; }`. One declaration, so the keyboard path is
never the one that got forgotten.

### Buttons
- **Shape:** hard-cornered (0) inside the stage; 10px on dock actions, 9px in sheets.
- **Rail / ghost control** (`.bc__railBtn`, `.bc__k`, `.bc__copy`): `rgba(255,255,255,0.05)` on a `0.16` hairline, label at 11px uppercase 0.12em. Hover lifts fill to `0.13` and text to white; `:active` is `translateY(1px)`. Danger and info variants recolour the text and border only (`--bad` / `--take`) — they never fill, because whole-server operations are the rarest thing in the strip and must not compete with the score.
- **Dock action** (`.bc__act`): transparent, 44px minimum height, 13px/600 label with a glyph at 85% opacity. Hover is a `0.12` white wash; `:active` is `translateY(1px) scale(0.985)`.
- **Apply** (`.bc__apply`): the only filled button in the product — staged amber with near-black text, 44px, two stacked lines (label 13px/800 plus a 10.5px hint). Hover is `brightness(1.1)` rather than a colour change. Disabled drops to `rgba(255,255,255,0.14)` with dimmed text.
- **Sheet button** (`.bc__btn`): `rgba(255,255,255,0.06)` on a `0.22` hairline, 9px radius, 44px. The danger variant fills with `--bad`.

### Chips
- **Staged chip** (`.bc__chip`): the dock's near-black at 94% with a `0.2` hairline and `blur(12px)`, 11px/600. The changed value inside is amber (`em` restyled to normal weight in `--take`); a note beside it drops to `ink-quiet`. `--heavy` warms the border to amber at 60%; `--conflict` turns border and value red.
- **Rounds** (`.bc__rnd`): 20px squares, 9px tabular digits, tinted 14% in the winning side's colour on a 42% border of the same.

### Cards / Containers
- **In the stage:** there are no cards. Regions are separated by hairlines and differ by fill — `rgba(0,0,0,0.42)` for the rail, `0.30` for the rundown, `0.22` for the round strip, `0.25` for the bench, `rgba(255,255,255,0.02)` for the centre column.
- **In the documents:** plain shadcn `Card` at `oklch(1 0 0 / 5%)` with the `0.09` border and zero radius, inside the 1180px reading column. Translucent on purpose — a card is a lit region of the stage, not a slab.

### Inputs / Fields
- **Sheet input** (`.bc__input`): `surface-rest` on a `0.16` hairline, 13px, `8px 11px`, full width. Hover raises the border to `0.28`; focus goes white border on a `0.08` fill. Placeholder at `rgba(255,255,255,0.35)`.
- **In-place field** (`.bc__nameField`, `.bc__limitInput`): no box at all — transparent, inherits its display size, and states its editability with a dashed bottom rule that solidifies on hover, turns amber on focus, and turns amber or red permanently when staged or conflicted.
- **Switch** (`.bc__switch`): a labelled control with a real 26×14 track and a 10px knob that translates 12px. On = white track at 60%; staged = amber track; unknown = dashed border, dimmed label, 12% track.

### Navigation
- **Rail links** (`.bc__navLink`): 11px uppercase at 0.14em in `ink-quiet`, 6px×10px. The active state is `aria-current="page"` — the link is the fact, the underline is the rendering of it — drawn as a 2px white bar that grows from the centre outward on hover (`left/right: 50% → 10px`, 160ms). There is no sidebar and no Dashboard link: the match is what you are already on, and the wordmark is the way back.
- **Segmented control** (`.bc__seg`): a bordered strip of 11px uppercase buttons with an underline that expands from the centre on hover; the selected one inverts to a white fill with near-black text, staged fills amber, conflicted fills red.

### Signature: the dock
The gallery's control bank, fixed over the bottom of the stage, built out of three
stacked things: staged **chips** naming every pending edit, then a row of **pills**.
The "happens now" pill carries the immediate interventions and a single shared
status line (`.bc__nowSay` / `.bc__actSay`) — whatever you point at speaks through
it, and it reports what is staged when you point at nothing. The commit pill
appears only when something is staged, tagged in amber, with the plain-language
summary and Apply. During an apply, a 2px amber bar animates `scaleX(0→1)` over
`--applyMs` (1600ms) along the bottom of the button, because an apply is a request
and not a fact.

### Signature: the cut
One authored moment, fired when the server confirms an apply and never on click: a
white gradient sweeps the band left to right over 260ms and vanishes. It is the
only animation in the system that is not feedback on an input.

### Motion
`--ease: cubic-bezier(0.16, 1, 0.3, 1)` on everything. Four durations by job:
**90ms** press, **110–140ms** hover and colour change, **160–240ms** state and
reveal, **260–300ms** the two authored moments (the cut, the mode menu resolving
out of blur). Transitions animate transform, opacity, filter and colour only.
`@media (prefers-reduced-motion: reduce)` inside `.bc` kills every animation and
clamps every transition to 1ms, and pins the progress bar to complete.

## Do's and Don'ts

### Do:
- **Do** use `--take` (`#ffd166`) for anything staged and not yet on the server, in every form it takes: border, text, row edge, chip, fill.
- **Do** give "unknown" its own dim, dashed treatment. Absence of evidence is never rendered as the good answer or the bad one.
- **Do** build new surfaces out of white at low alpha over `#06070a`, on the existing ladder (`0.02 / 0.05 / 0.13` fills, `0.09 / 0.16 / 0.4` borders).
- **Do** keep in-stage controls square, and reserve radius for things that float and cast one of the four lift shadows.
- **Do** put every clickable target at 44px minimum height in the dock, the sheets and the map pool, and 32px for the inline row moves.
- **Do** pair any hover-revealed affordance with `:focus-within` and a `@media (hover: hover) and (pointer: fine)` gate, so it exists on touch. A Kick that only appears on hover is a Kick nobody finds.
- **Do** carry `tabular-nums` on every number that updates in place.
- **Do** render `/settings` and `/history` as shadcn documents in the 1180px reading column.
- **Do** give portalled primitives the dock's surface explicitly in `app/globals.css`; the world's variables do not reach them.
- **Do** state the reason a control is missing (`.bc__absent`, `.bc__issues`) rather than drawing it dead.

### Don't:
- **Don't** introduce a sixth state colour. CT blue, T orange, on-air red, staged amber and fault red are the vocabulary; a new state reuses one of them or is spelled with the ink ladder.
- **Don't** use amber for anything already applied, or on-air red for anything that is not currently happening.
- **Don't** put the `.bc` stage on `/settings` or `/history` — or shadcn cards on `/dashboard`. The split between stage and document is deliberate, and "fixing" either half breaks it.
- **Don't** give a `.bc__` control a corner radius, and don't let a shadcn component reintroduce one; `--radius` is `0rem` for that reason.
- **Don't** set a tracked uppercase label at 13px or above, or prose below 12px. There are two registers and no middle.
- **Don't** use 9px for anything longer than three characters.
- **Don't** re-pick the CT/T hues per component; both stylesheets carry the same two values so a chart and the band agree.
- **Don't** mirror a roster row by overriding a few children — place every child explicitly in both variants.
- **Don't** reverse the stat column order on the mirrored side. K stays first on both halves so the two teams compare down a line.
- **Don't** animate anything but transform, opacity, filter and colour, and don't add a second authored moment; the cut is the one.
- **Don't** repaint the stage from a staged value. Art, rundown, pips and the round line are frozen to what is on air; a staged map shows as a cue thumbnail.
