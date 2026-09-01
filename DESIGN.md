---
name: sidearm
description: A quiet neutral admin dashboard for a self-hosted CS2 server, where colour is spent only on state.
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0 0)"
  card: "oklch(1 0 0)"
  sidebar: "oklch(0.985 0 0)"
  primary: "oklch(0.205 0 0)"
  primary-foreground: "oklch(0.985 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "oklch(0.505 0 0)"
  border: "oklch(0.922 0 0)"
  ring: "oklch(0.58 0.19 258)"
  destructive: "oklch(0.545 0.22 27.3)"
  ok: "oklch(0.52 0.14 150)"
  warn: "oklch(0.55 0.13 72)"
  danger: "oklch(0.545 0.22 27.3)"
  info: "oklch(0.55 0.18 258)"
  pending: "oklch(0.58 0.13 72)"
  unknown: "oklch(0.505 0 0)"
  team-ct: "oklch(0.52 0.15 250)"
  team-t: "oklch(0.58 0.16 52)"
  chart-1: "oklch(0.55 0.18 258)"
  chart-2: "oklch(0.55 0.14 165)"
  chart-3: "oklch(0.62 0.15 60)"
  chart-4: "oklch(0.55 0.19 305)"
  chart-5: "oklch(0.6 0.13 200)"
typography:
  display:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tabular-nums"
  headline:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 2rem
  title:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.25rem
  body:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.025em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.625
rounded:
  none: "0"
  sm: "0.3rem"
  md: "0.4rem"
  lg: "0.5rem"
  full: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.none}"
    padding: "0 0.625rem"
    height: "2rem"
    typography: "{typography.label}"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.none}"
    padding: "0 0.625rem"
    height: "2rem"
    typography: "{typography.label}"
  button-outline-hover:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive}"
    rounded: "{rounded.none}"
    padding: "0 0.625rem"
    height: "2rem"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.none}"
    padding: "1rem 0"
    typography: "{typography.body}"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.none}"
    padding: "0.25rem 0.625rem"
    height: "2rem"
    typography: "{typography.body}"
  badge-outline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.none}"
    padding: "0.125rem 0.5rem"
    height: "1.25rem"
    typography: "{typography.label}"
  status-pill-ok:
    backgroundColor: "{colors.ok}"
    textColor: "{colors.ok}"
    rounded: "{rounded.none}"
    padding: "0.125rem 0.5rem"
    height: "1.25rem"
  status-pill-unknown:
    backgroundColor: "{colors.unknown}"
    textColor: "{colors.unknown}"
    rounded: "{rounded.none}"
    padding: "0.125rem 0.5rem"
    height: "1.25rem"
  action-bar-button:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "3.5rem"
    typography: "{typography.label}"
  nav-item-active:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.none}"
    padding: "0 0.5rem"
    height: "3rem"
---

# Design System: sidearm

## Overview

**Creative North Star: "The Instrument Panel"**

sidearm reads like the readout on a piece of equipment you trust: near-white or near-black
ground, hairline rules dividing information, square corners, and no decoration competing with
the numbers. The whole surface is neutral at chroma 0 except where a colour is carrying a
fact — a server state, a team side, a chart series. That restraint is the identity. The panel
is deliberately *not* the dark-with-one-neon-accent costume the game-server category defaults
to; a tool people run a live match from should not look like a skin.

Density is high and deliberate. The default text size inside a card is 12px, controls are 32px
tall, and cards carry 16px of internal padding — the panel is meant to show a whole server's
state without scrolling on a laptop. Both themes are real, not an inverted afterthought: the
light theme is white ground with a 0.922 grey hairline, the dark theme is a 0.145 ground with
cards *lifted* to 0.185 and borders dissolved to `oklch(1 0 0 / 11%)`. The system follows the
operating system via next-themes, because the panel is read in a bright room before a session
and a dark one at 2am.

Colour is a vocabulary, not a palette. Eight semantic tokens (`ok`, `warn`, `danger`, `info`,
`pending`, `unknown`, `team-ct`, `team-t`) each with a `-foreground` pair are the only way
state is ever spelled, so "running" is one green in the status pill, the console and the
scoreboard rather than three hand-picked emeralds. Everything else — buttons, headings,
sidebar, the primary action — is ink.

**Key Characteristics:**
- Neutral gray ramp at chroma 0; every hue on screen is load-bearing.
- Ink primary (`oklch(0.205 0 0)` light, `oklch(0.985 0 0)` dark) — the primary action is not a brand colour.
- Square by default: cards, buttons, inputs and badges are `rounded-none`.
- Hairline structure: 1px borders and `ring-1` outlines instead of shadows.
- Geist Sans for language, Geist Mono strictly for machine text.
- Tabular figures on every number that updates in place.

## Colors

A near-neutral ground with a high-contrast neutral primary and exactly one blue for focus,
links and information — plus a fixed semantic set that only ever means state.

### Primary
- **Ink** (`{colors.primary}` / inverted to near-white in dark): every default button, the sidebar
  mark, the active nav row, the badge default. It is the strongest thing on screen precisely
  because it has no hue to compete with the state colours.

### Secondary
- **Signal Blue** (`{colors.ring}`): the focus ring, `--sidebar-ring`, and links. Never used as a
  fill for a resting control. In dark it lifts to `oklch(0.68 0.16 258)` to stay visible on near-black.
- **Information Blue** (`{colors.info}`): the `updating` state and informational callouts. Deliberately
  one step off the focus ring so a focused control and an informational badge do not read as the
  same thing.

### Tertiary — the state vocabulary
- **Operating Green** (`{colors.ok}`): running, healthy, "nothing to recreate".
- **Amber Caution** (`{colors.warn}`): a condition that needs a human but is not yet a failure —
  the host-side work callout in the preset picker (`bg-warn/8` with a `border-warn/30` hairline).
- **Alert Red** (`{colors.danger}`): crashed, destructive actions, the Kick target. Shares its value
  with `--destructive` in light so a destructive button and a crashed pill cannot drift apart.
- **In-Flight Amber** (`{colors.pending}`): starting, stopping, pause requested. Paired with a pulsing dot.
- **Grey Unknown** (`{colors.unknown}`): the panel cannot see. Neutral by construction.
- **CT Blue** (`{colors.team-ct}`) / **T Orange** (`{colors.team-t}`): the two sides, taken from CS2's
  own convention rather than invented.

### Neutral
- **Paper / Ink Ground** (`{colors.background}` → `{colors.foreground}`): page ground and primary text.
- **Card** (`{colors.card}`): identical to the ground in light (structure comes from the hairline);
  lifted one step in dark so cards read as objects rather than outlines.
- **Sidebar** (`{colors.sidebar}`): one step off the ground, in both themes, so the shell is legible
  without a border doing all the work.
- **Muted / Muted Foreground** (`{colors.muted}` / `{colors.muted-foreground}`): hover fills, secondary
  surfaces, and every explanatory line under a control.
- **Hairline** (`{colors.border}`): all structure. In dark this becomes `oklch(1 0 0 / 11%)` — a
  translucent white rather than a grey, so it holds over both card and ground.

### Charts
Five categorical hues (`{colors.chart-1}`…`{colors.chart-5}`: blue, green, amber, violet, cyan), chosen
to be told apart, not ordered. They are not a sequential ramp and must not be used as one.

### Named Rules
**The Meaning-Only Colour Rule.** A hue appears on screen only when it reports something. State
is spelled with the semantic tokens (`bg-ok/12 text-ok border-ok/30`), never with a raw palette
class. Audit test: if you can't say what fact a coloured pixel is reporting, it should be neutral.

**The Unknown Is Not A Verdict Rule.** The `unknown` state is grey, dashed-bordered, and its dot
does not pulse. It must never be dressed as good (green) or bad (red), and it must never animate
— nothing is in progress, the panel simply cannot see.

**The Tinted-Surface Rule.** State colour on a surface is a low-alpha tint of the token plus the
solid token as text: 8–12% fill, 30% border, full-strength foreground. Solid state fills are
reserved for the CS2-side accents and chart series.

## Typography

**Display / Body Font:** Geist Sans (`--font-geist-sans`, with system-ui fallback)
**Heading Font:** Geist Sans — `--font-heading` points at the sans stack.
**Mono Font:** Geist Mono (`--font-geist-mono`)

**Character:** One neutral grotesk doing all the talking, with a fixed-advance companion that is
never decorative. Headings were mono in the previous identity and are not any more: mono on a
page of prose labels reads as terminal cosplay, and its fixed advance earns its place only where
the content is literally machine text.

### Hierarchy
- **Display** (700, 3rem → 3.75rem `sm` → 4.5rem `md`, line-height 1, tabular): the two match scores on
  the dashboard, and nothing else. The only type on the system allowed to dominate a viewport.
- **Headline** (600, 1.5rem): the page title, one per route ("Console", "Config", "Match Control").
  Also the KPI value inside a stat card, where it carries `tabular-nums`.
- **Title** (500, 0.875rem, `font-heading`): every card, dialog and sheet title. Card titles are small
  and quiet on purpose — the card's content is the headline, not its name.
- **Body** (400, 0.75rem, line-height relaxed): the default inside a card, and the size of most
  controls' text. 0.875rem is the step up for list rows and prose outside cards.
- **Label** (500, 0.75rem, `uppercase tracking-wide` in the muted foreground): stat-card labels and the
  small captions above copyable blocks (`.env`, `then`). The only uppercase in the system.
- **Mono** (400, 0.75rem): map names, Steam64 ids, cvars, console output, the connect string, the
  exact command a destructive dialog is about to run.

### Named Rules
**The Machine-Text Rule.** Geist Mono is for things a machine wrote or a machine will read:
commands (`docker restart cs2`), cvars (`mp_maxrounds/2`), ids, telemetry, map names
(`de_mirage`). Prose, labels and headings are sans. If a human wrote the sentence, it is not mono.

**The No-Twitch Numbers Rule.** Any number that updates in place — score, ping, CPU, uptime, round
counter, slot counts — carries `tabular-nums` (the `.tabular` utility or the Tailwind class). A
poll must never re-flow the layout.

**The One Headline Rule.** A page gets exactly one 1.5rem heading. Everything below it is a card
title at 0.875rem. Sections do not compete with the page.

## Layout

The shell is a persistent sidebar plus a top bar, inside a viewport-height frame: `SidebarInset`
is pinned to `h-svh` with `overflow-hidden` and `main` owns all scrolling, so a page like Console
can pin its RCON input to the bottom edge. The sidebar collapses to icons; under `md` it is a
drawer and the top bar keeps the status pill, the connected count and the Start/Stop/Restart
controls (labels collapse to icons under `sm`).

Page padding is 1rem, stepping to 1.5rem at `md`. `main` carries a bottom pad of
`calc(4.5rem + env(safe-area-inset-bottom))` under `md` so the last control on any page clears
the fixed action bar, and drops back to 1.5rem at `md` where the bar is gone.

Rhythm is a 0.25rem grid used tightly: 0.5rem between related controls, 0.75rem inside a
bordered sub-panel, 1rem between cards and inside card padding, 1.5rem for page-level separation.
Cards default to 1rem vertical padding with 1rem horizontal on header/content, and a compact
`size="sm"` variant at 0.75rem.

Grids are content-counted, not fixed: stat tiles run `grid-cols-2` → `lg:grid-cols-4`, preset and
match-action tiles run 1 → `sm:grid-cols-2` → `lg:grid-cols-3`. Breakpoint of record is `md`
(768px): it is where the action bar disappears, page padding grows, and list layouts become tables.

### Named Rules
**The Two-Layouts Rule.** Tabular data ships as two layouts, not one that stretches: a card/list
layout `md:hidden` and a real table `hidden md:block`. The roster and match history both do this.
A table squeezed onto 390px, or a card list stretched across 1440px, is a defect.

**The Thumb-Reach Rule.** On a phone, intervention lives on the bottom edge. The action bar is
`fixed inset-x-0 bottom-0`, `md:hidden`, four equal-width 3.5rem targets, with
`pb-[env(safe-area-inset-bottom)]` so it clears the home indicator. Anything it opens is a sheet
from the *same* edge — the list you pick from appears under your thumb, never above it.

## Elevation & Depth

Flat by construction. Depth is tonal and linear: a 1px hairline or a `ring-1` outline separates
surfaces, and in dark the card lifts one lightness step (0.145 → 0.185, popovers to 0.205)
instead of casting anything. Cards carry `ring-1 ring-foreground/10` rather than a border-plus-shadow.
Shadows exist only where a surface genuinely floats above content: the sidebar drawer, dialogs,
sheets, dropdowns and toasts, all inherited from the primitives. The two translucent chrome
surfaces — the top bar and the action bar — use `bg-card/95` with `backdrop-blur-xs` so content
scrolling under them stays readable without a shadow line.

### Named Rules
**The Hairline-Over-Shadow Rule.** Structure is drawn, not lit. A resting surface earns a 1px
border or a `ring-1`; it does not earn a shadow. Shadow means "this is floating over the page and
will go away".

**The Dashed-Border-Means-Absent Rule.** A dashed hairline marks a container with nothing in it or
nothing knowable: the empty scoreboard, the "no maps" panel, the console's disconnected notice,
the `unknown` status pill. Solid borders are for real content.

## Shapes

Square. `--radius` is 0.5rem and drives the `--radius-sm/md/lg/xl` scale, but the shipped primitive
layer sets `rounded-none` on buttons, cards, badges, inputs, dialogs, sheets and card media — the
form language of the panel is a hard 90° corner and a hairline, which is what makes a dense grid of
tiles read as an instrument rather than a set of pills.

Radius survives in two places, and only these two: touch and interactive surfaces get
`rounded-md` (0.4rem) — action-bar slots, sheet rows, preset and match-action tiles, inline
bordered sub-panels — and genuinely circular things get `rounded-full`: avatars, the status dot,
the map-pool count badge, the live-poll pulse.

### Named Rules
**The Square Chrome Rule.** Anything that is part of the panel's chassis — card, button, input,
badge, dialog, table — is `rounded-none`. Softening one of them breaks the alignment of every
hairline it sits next to.

**The Rounded-Means-Touchable Rule.** A 0.4rem radius is the signal that a whole block is a tap
target. If a rounded rectangle is not clickable, it is the wrong shape.

## Components

### Buttons
- **Shape:** hard square corners (`rounded-none`), 2rem tall by default (1.5rem `xs`, 1.75rem `sm`,
  2.25rem `lg`), 0.625rem horizontal padding, 0.75rem medium label.
- **Primary:** ink fill (`{colors.primary}`) with inverted foreground. The default and the rarest —
  one per surface.
- **Outline:** the workhorse. Transparent on the ground with a `{colors.border}` hairline; hover fills
  to `{colors.muted}`; in dark it is `bg-input/30` with an `--input` border.
- **Ghost:** icon actions in bars and rows; nothing at rest, muted fill on hover.
- **Destructive:** a 10% destructive tint with full-strength destructive text (20% in dark) — never a
  solid red slab. Red is loud enough as text.
- **Hover / Focus:** `transition-all`; focus is `focus-visible:border-ring` plus
  `ring-1 ring-ring/50`. Pressed state nudges 1px down (`active:translate-y-px`) except on menu triggers.

### Cards / Containers
- **Corner Style:** square (`rounded-none`), including any first/last child image.
- **Background:** `{colors.card}`; `ring-1 ring-foreground/10` as the only separation from the ground.
- **Internal Padding:** 1rem vertical / 1rem horizontal, 4-unit gap between slots; the `sm` size drops
  to 0.75rem.
- **Title:** `font-heading` 0.875rem/500. **Description:** 0.75rem relaxed, muted.
- **Footer:** a top hairline and 1rem padding; the card's own bottom padding collapses when present.

### Inputs / Fields
- **Style:** 2rem tall, square, `border-input` hairline on a transparent ground (`bg-input/30` in dark),
  0.75rem text.
- **Focus:** border shifts to `--ring` with `ring-1 ring-ring/50`. No glow.
- **Invalid:** `aria-invalid` drives a destructive border and a 20% destructive ring (40% in dark).
- **Disabled:** 50% opacity with a filled `input/50` ground — visibly inert, still readable.

### Badges
1.25rem tall, square, 0.5rem padding, 0.75rem medium. Variants mirror the button set (default ink,
secondary, outline, destructive tint, ghost). Icons inside are forced to 0.75rem.

### Navigation
Sidebar rows are square, icon-plus-label at 0.875rem, active row filled with the sidebar accent;
the collapsed rail keeps the icon only. Role gates the list: an item the account can never reach is
not rendered.

### Status Pill (signature)
The single source of truth for server state. Seven states map to six semantic tokens through one
lookup: a 12% tinted fill, a 30% token border, token-coloured text, and a 0.375rem dot. The dot
pulses only for genuinely in-flight states (running, starting, updating, stopping). `unknown` adds a
dashed border and no pulse, and the three states where appearance and truth can diverge (unknown,
crashed, updating) carry a `title` explaining *why* the panel is reporting it.

### Danger Confirm (signature)
A destructive confirmation that states blast radius with live numbers read at the moment of asking —
"9 players connected · Round 25 of 24 · CT 12 – 12 T" — then the consequence, then the exact command
in mono. It **skips itself entirely when nobody is connected**: a dialog that always appears is one
people learn to dismiss unread. Two places deliberately do not use it — deleting a panel user and
discarding match setup — because that data loss does not depend on who is connected, so a
player-count-gated prompt would be the wrong instrument.

### Action Bar (signature)
Fixed to the bottom edge under `md`, moderator and up, `bg-card/95` with a top hairline and a blur.
Four equal 3.5rem slots (Pause, Map, Kick, More), icon over an 11px label, Kick tinted `text-danger`.
Pause and Restart fire directly; Map and Kick open a bottom sheet capped at `80svh`. A destructive row
inside a sheet **arms in place** (its own row tints `bg-danger/10` and reveals a Kick button) rather
than opening a second dialog, because a second surface would cost the move the bar exists to save.

### Preset Picker (signature)
Capability truth as a layout. Settings the panel can actually apply are square-cornered tiles that
fill the form below. The half it cannot apply — the launch-argument slot ceiling — renders as a
warn-tinted panel (`bg-warn/8`, `border-warn/30`) containing the exact `.env` lines and the one host
command in a mono `pre`, each with a copy button. It appears only when the running container actually
disagrees with the preset.

## Do's and Don'ts

### Do:
- **Do** spell state with the semantic tokens (`text-ok`, `bg-danger/10`, `border-warn/30`), never a raw
  palette class, so one meaning is one colour in both themes.
- **Do** keep `rounded-none` on cards, buttons, inputs, badges and dialogs; reserve `rounded-md` (0.4rem)
  for whole-block tap targets and `rounded-full` for dots and avatars.
- **Do** put `tabular-nums` on every number that updates in place.
- **Do** ship tabular data as two layouts — card list under `md`, table at `md` and up.
- **Do** show the exact command or cvar in Geist Mono next to the control that runs it.
- **Do** hide what a role can never do, and disable only for transient conditions (a request in flight,
  Docker unreachable).
- **Do** state blast radius with live numbers before a destructive action, and skip the prompt when
  there is genuinely nothing to lose.
- **Do** give both themes equal care: check any new surface against the dark ground, where the border
  is a translucent white and cards lift rather than outline.

### Don't:
- **Don't** introduce a brand hue for the primary action. The primary is ink, and colour is spent on
  meaning.
- **Don't** dress `unknown` as good or bad, and don't animate it — dashed, grey, still.
- **Don't** use the five chart colours as a sequential ramp; they are categorical, chosen to be told apart.
- **Don't** add a resting shadow to a surface. Hairlines and tonal lift carry structure; shadows mean
  floating and temporary.
- **Don't** set headings in Geist Mono. Mono is for machine text only.
- **Don't** stretch one responsive layout across the whole range, or put a fixed intervention bar on
  desktop — a mouse has no reach problem.
- **Don't** render a control that would appear to work and not. If the panel cannot change something,
  print what a human must run instead.
