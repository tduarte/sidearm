# sidearm — UX brief (superseded 2026-08-31)

> **Superseded.** This brief was written while the visual identity was pinned, and while the
> panel had a single shared token instead of accounts. Both premises are now false: see
> `DESIGN.md` for the visual system and `PRODUCT.md` for the three-role model. Its structural
> findings were implemented and are kept here as the record of why — the copy, state and
> interaction reasoning below is still accurate. Do not take its *visual* constraints as
> current.

Scope: the whole panel, all eight routes. Visual identity was pinned and unchanged at the
time of writing — dark shadcn/ui, amber `--primary`, Geist Sans/Mono, Phosphor icons,
sidebar + top bar. Every change below is structure, interaction, state, or copy.
Mode: **Operate**.

---

## 1. Job and audience

The owner-operator and, on other installs, community server admins. Both are full admins with
one shared token. Three moments the panel must serve, in this order of pressure:

| Moment | What they need | Where it currently lives |
|---|---|---|
| **Mid-match intervention** | kick · change map · pause · restart | four separate routes |
| **Diagnosing when it broke** | derived state + reason + console + update status | top bar + `/console` |
| **Before the session** | is it up, is it secure, pick map, share connect URL | `/dashboard` + `/maps` + `/config` |

Success: the admin answers *"is it up, what is it doing, what do I press"* in one glance and
acts without leaving the screen or dropping the match.

## 2. The core problem

The panel is competently built and truthful in its backend — `lib/cs2/status.ts` derives
state from three signals, `real.ts` refuses to invent an answer. **The interface spends most
of that honesty.** Actions report the HTTP response rather than the outcome, failures are
invisible, the panel's real constraints are hidden behind editable-looking fields, and the four
mid-match controls are four navigations apart.

Ten findings, each grounded in code, ordered by how much they cost the admin:

1. **Failures are silent.** `top-bar.tsx`, `players/page.tsx`, `match/page.tsx`,
   `maps/page.tsx` all define mutations with `onSuccess` only — no `onError`. With the Docker
   socket missing (the documented half-broken-panel failure mode in AGENTS.md), Start / Stop /
   Restart do nothing at all, with no message. Only `applyUpdate` handles errors.
2. **Toasts fire on acknowledgement, not on outcome.** "Server restarting" and
   "Changing map to `de_dust2`" appear the moment the request returns 200. A workshop map
   *downloads before it loads* (~1 min, documented), a restart takes 30-90s, an update pull
   is tens of GB. The panel says done, then goes quiet, and the map name doesn't change for a
   minute. `changeMap.isPending` covers only the HTTP call, so tiles re-enable instantly.
3. **Blast radius is not stated where the action is.** Stop and Restart sit in the top bar with
   no confirmation while nine people are connected. Map tiles change the map on a single click.
   The kick dialog says "removed from the current match immediately" but not who they are or
   what the score is. Only the update button names its consequence, and only in a `title`.
4. **The config form implies powers the panel does not have.** `/config` presents tickrate,
   maxPlayers, ports, GSLT and RCON password as editable fields; `real.ts.putConfig` applies six
   cvars over RCON and redacts the rest, and the launch-argument fields cannot be applied at all
   without a container recreate the panel cannot perform. Saving reports "Config saved".
5. **`/settings` is a mock that contradicts reality.** Admin username + password fields and a
   "Require login" switch, none of them wired, describing an auth model that does not exist —
   the real mechanism is a single `PANEL_ADMIN_TOKEN` bearer token (`auth-gate.tsx`).
6. **The same thing is presented three ways.** Match state: dashboard hero badge, dashboard
   Match card, `/match`. Roster: dashboard scoreboard, dashboard "Players" stat-card mini-table,
   `/players`. Chat: `/console` tab and `/history` tab.
7. **Mid-match reach is four navigations.** Kick is in `/players`, map in `/maps`, pause in
   `/match`, restart in the top bar. `cmdk` is already a dependency and is unused.
8. **No first-run and weak empty states.** A fresh install pulling 40-70 GB shows progress only
   in the top bar; the dashboard hero renders `unknown` / `0/10` as though normal. The roster's
   "No players match." is shown both for an empty server and for a search miss. The console's
   "No events yet…" teaches nothing.
9. **Phone is a stated moment and an unstyled table.** `/players` is seven columns, `/history`
   five, neither with a responsive treatment; `console-pane` fixes a 60vh log with the RCON
   input below the fold. (`match-scoreboard.tsx` is the one component that does this right and
   should be the model.)
10. **Console output is cramped and undifferentiated.** RCON replies arrive as one event
    carrying `> cmd\noutput`, rendered inside a flex row with `break-all`, so `status` output
    wraps into a narrow column with mid-word breaks and no visual difference between what you
    typed, what came back, and what failed. Update state is also invisible unless
    `state === "running"`, and `CS2_AUTO_UPDATE` being armed is never shown.

## 3. Selected direction

**The panel reports outcomes, not acknowledgements — and never claims a power it lacks.**

Three mechanisms, applied consistently across every surface. They are the design; everything
else is placement.

**A. Committed / pending / confirmed.** Any action whose effect outlives the request enters a
*pending* state owned by the object it affects — the map tile, the status pill, the server
identity block — and leaves it only when live status confirms, not when fetch resolves. Pending
carries elapsed time and the documented expectation ("workshop maps download first; a first
fetch takes about a minute"). Failure and timeout are states, not the absence of one.

**B. Blast radius at the trigger.** Every disruptive control states, with live numbers, what it
does to the people currently on the server and the exact operation it runs:
`Restart container · 9 players will be dropped · docker restart cs2`. Full-stop actions get an
`AlertDialog`; medium ones arm inline (click to arm, click to fire) rather than opening a modal.
This extends the existing habit of printing `mp_restartgame 1` under the tile.

**C. Capability truth.** Fields and buttons the panel cannot actually action are not rendered as
if it can. Two tiers everywhere: *applies now (RCON)* and *requires a container recreate — the
panel cannot do this*, the latter shown read-only with the exact command to run on the host.
Same treatment for a dead Docker socket: a persistent banner and disabled lifecycle controls
with a reason, instead of buttons that quietly do nothing.

## 4. Structure

Eight routes become seven, and the split follows the three moments rather than the data model.
Decided with you 2026-08-25: the roster merges into Ops; `/settings` stays but is rebuilt
around what is actually true.

```
Ops        ← dashboard + players merged: the live surface (/players is retired)
Match      ← unchanged in scope, deduplicated against Ops
Maps       ← + pending map-change state
Console    ← live log + RCON, chat removed
Config     ← the server: applies-now vs set-at-boot
History    ← matches + chat
Settings   ← the panel: token state, API mode, version, local preferences
```

- **Ops** is one continuous surface, not a hero card stacked on a match card stacked on four
  stat cards: identity + connect URL + condition (with the reason for the condition), the live
  match strip, the full actionable roster, then signals. It absorbs `/players` entirely — search,
  SteamID copy, kick and the per-player menu all live here, so the mid-match roster is never a
  navigation away. The duplicate mini-roster inside the Players stat card is deleted; the stat
  cards keep CPU / memory / FPS. Because Ops is now long, the roster is the anchor: it gets a
  sticky header with the live counts (`10 connected · CT 5 · T 5`) and the search field, and
  signals sit below it rather than competing above it.
- **Config** is the *server*, in two groups: *Applies now* (hostname, password, mode, bots — the
  six cvars `putConfig` really sends) and *Set at boot* (tickrate, slots, ports, workshop
  collection, GSLT — read-only, each with the host command that changes it).
- **Settings** is the *panel*, and every row on it is real: whether `PANEL_ADMIN_TOKEN` is set
  and this browser holds a session (from `/api/auth`), how to sign out, real vs mock API mode,
  version, and the two local preferences that genuinely exist — console autoscroll default and
  desktop notifications, persisted client-side. The username/password fields and the "Require
  login" switch are removed: they describe a mechanism the panel does not have.
- **Command palette (⌘K)**, built on the existing `cmdk` dependency: change map, kick a named
  player, pause, restart, run an RCON command. This is what makes the mid-match moment one move
  from anywhere, without moving controls into a cluttered top bar.
- **Sidebar and top bar stay.** The top bar keeps state + lifecycle; it gains the pending model
  and confirmation, not new controls.

## 5. States and ranges

Every surface designs for these, not just the happy path:

- **Server:** running · starting · updating (0-100%, with GB) · stopping · stopped · crashed ·
  **unknown** (RCON silent, Docker unreachable — must never render as running).
- **First run:** container up, steamcmd pulling 40-70 GB, RCON silent, no map, no players. This
  gets a real screen explaining that this is normal and how long it takes.
- **Roster:** 0 (server empty — distinct from a search miss), 1-10 typical, up to 64; names
  contain unicode and can be long; `userId` is absent for players seen only in logs.
- **Maps:** ~25 official + 0-30 workshop; art missing for workshop maps.
- **Console:** silent, 2000-line cap, a `status` reply of ~20 lines, a rejected command.
- **Degraded:** Docker socket gone (RCON and chat still work), RCON dead (Docker still works),
  GSLT dead (server runs, insecure, players cannot find it).

## 6. Interaction and layout

- Pending is visible on the object, not only in a toast; toasts stop announcing completion for
  anything that isn't instant.
- Destructive confirmation carries live context (players, round, score) rendered at read time.
- Phone: roster and the four intervention actions are thumb-reachable; tables below `sm` become
  the row-per-record pattern `match-scoreboard.tsx` already uses. Console input is fixed to the
  bottom of the viewport, log scrolls above it.
- Console distinguishes echoed command, reply, and error; multi-line replies get their own
  block instead of a table cell with `break-all`.
- Empty states teach the next action ("no workshop maps yet — paste a Workshop URL").
- Motion 150-250ms, state-conveying only. No page-load choreography.

## 7. Constraints and anti-goals

- **Do not touch** the visual identity: palette, `--primary`, radii, fonts, icon set, shell.
  Ad-hoc `emerald-/sky-/zinc-/blue-500` literals in `status-pill.tsx`, `console-pane.tsx` and
  the team badges may be moved onto tokens, but the resulting colours must look the same.
- **Do not touch** the backend contracts (`lib/api/types.ts`), the WS event set, RCON safety
  (`assertCommandAllowed`), or `PANEL_TRUSTED_CIDRS` peer handling.
- Keep shadcn components; no invented affordances for standard tasks.
- Do not invent capabilities: no ban, no scheduled restarts, no per-user accounts, no metrics
  the backend does not emit.
- `/players` is retired into Ops; keep the path as a redirect so existing bookmarks survive.
- Nothing on `/settings` is currently wired, so rebuilding it means adding real client-side
  persistence for the two local preferences — not restyling the mock.

## 8. Sequencing

1. Outcome, pending and failure states (mechanism A) — the largest gain per line changed.
2. Blast radius at the trigger and capability truth (mechanisms B and C).
3. Route work: `/players` folded into Ops, Config split by tier, Settings rebuilt honestly.
4. Command palette on the existing `cmdk`.
5. Mobile: roster and the four intervention actions.
6. First-run screen and the empty states.

Open: whether desktop notifications on Settings should be built now (it needs a Notification
permission prompt and a rule for what is worth interrupting someone for) or deferred with the
switch omitted rather than shown inert.
