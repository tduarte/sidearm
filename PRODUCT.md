# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two confirmed audiences, one panel:

- **The owner-operator** (primary). Runs sidearm for their own group. Knows the server
  intimately, opens the panel from a desktop before a session and from whatever device is
  in reach when something goes wrong mid-match.
- **Community server admins running their own install** (secondary). Found sidearm on
  GitHub, ran `docker compose up`, and reach a fresh panel with no tour of the codebase
  behind them. They know CS2 and RCON; they do not know sidearm's conventions.

Neither is necessarily alone any more. **Superseded 2026-08-31:** the panel has real
accounts with three roles — `admin`, `moderator`, `viewer` — created on first run and stored
in the panel's own SQLite. The owner-operator is the admin; friends who help run a match are
moderators; people who only want to watch and pull their own demos are viewers. That last
role is why the change was asked for. `PANEL_ADMIN_TOKEN` survives as a break-glass
credential and as the setup token that gates registering the first account, not as the
login.

## Product Purpose

sidearm is a self-hosted Counter-Strike 2 dedicated server shipped with a web admin panel
as one `docker compose up`. The panel exists so running a CS2 server does not require a
terminal, an RCON client, or knowing which of six failure modes produced the silence.

Success: the admin answers "is it up, what is it doing, and what do I press" in one glance,
and can act — map, phase, kick, restart — without leaving the browser or dropping the match.

## Positioning

Most CS2 panels are game-panel plugins (Pterodactyl eggs and similar) that treat CS2 as one
more game process. sidearm is CS2-specific and owns the whole stack: it reads Docker,
RCON, the container's boot logs and Steam's build API together, so it can distinguish
*Running*, *Starting*, *Updating 68% (48.2 / 70.1 GB)*, and *Crashed* — states a generic
"container is up" panel collapses into one green dot for hours.

## Operating Context

- Deployed as a Docker Compose stack: `cs2` (joedwards32/cs2), `panel`, a Docker socket
  proxy, optional Watchtower. Typically on a home LXC / small box on the same LAN as the
  admin.
- **Before the session:** confirm the server is up and secure, pick or subscribe a map, set
  the mode/rules, copy the `steam://connect/...` URL into a group chat.
- **Mid-match intervention:** something is wrong right now — a griefer, a wrong map, a
  stalled round. Fast read, fast action, often on a phone, without dropping the other nine
  players.
- **Diagnosing when it broke:** the server will not come up, an update is stuck, RCON is
  silent, GSLT is dead. The console, the state signals and the error text are the product.
- First boot downloads ~40–70 GB of game files, so "not answering yet" is normal for an hour
  and must never read as failure.

## Capabilities and Constraints

Confirmed capabilities (all wired to a real backend unless noted):

- Live status over WebSocket: state, hostname, map, players, uptime, CPU, memory, FPS,
  tickrate, connect URL, steamcmd progress.
- Lifecycle: start / stop / restart the `cs2` container; apply a pending CS2 update
  (a container restart *is* the update); optional auto-restart when the server is empty.
- Match control: phase (warmup → knife → live → halftime → ended), pause, demo recording,
  and a large grid of preset RCON actions grouped competitive / casual-DM / practice
  (including cheat-gated grenade-practice helpers).
- Players: live roster with team, K/D/A, ping, connected time; kick.
- Maps: official map tiles plus workshop subscribe-by-ID/URL; map change at runtime via
  `host_workshop_map` over RCON.
- Console: live log stream, chat-only filter, raw RCON input.
- History: stored match results and chat, in SQLite.
- Config: server identity, access, gameplay, networking — read and written through
  `/api/config`.

Constraints:

- Next.js 16 + React 19, Tailwind v4, shadcn/ui components, Phosphor icons, TanStack Query
  v5, custom `server.ts` with a `ws` server. Light and dark themes, following the operating
  system (`next-themes`); the hardcoded `<html class="dark">` is gone.
- The panel's authority ends at RCON and the Docker API. It **cannot** recreate the `cs2`
  container, so anything that is a launch argument (GSLT, workshop collection, maxplayers)
  cannot be changed from the UI at runtime.
- Docker-in-LXC is required; without the Docker socket the resource tiles and all lifecycle
  buttons fail while RCON keeps working — a half-broken panel, not an obviously dead one.
- RCON is deliberately unpublished outside the compose network.
- **Settled 2026-08-31:** Settings is real. It holds the signed-in account (change password,
  sign out), admin-only user management, appearance, and the console preferences that were
  previously mocked.

## Brand Commitments

- Name: **sidearm**, lowercase. Tagline in use: "CS2 panel". A sidearm is the pistol you
  fall back on — small, always on you, works when the primary does not. That is the panel's
  relationship to the server.
- Voice in the existing product is plain, precise and unhyped; it names the actual console
  command under each action (`mp_restartgame 1`) and states consequences before they happen
  ("Restarts the server immediately, players connected or not — you asked for it"). Keep it.
- No logo asset beyond a Phosphor `Crosshair` mark.
- **Unpinned and replaced, 2026-08-31.** The amber-on-black identity was the game-server
  category's default costume, and it made a tool people trust with a live match look like a
  skin. What replaced it is *the category standard, played straight*: a quiet neutral admin
  dashboard, a high-contrast neutral primary, and colour spent only where it carries state —
  with the Vercel dashboard as the craft bar. This is the standing exit, taken over the
  assigned direction at seed key `1acf5420`. Semantic tokens (`--ok`, `--warn`, `--danger`,
  `--info`, `--pending`, `--unknown`, `--team-ct`, `--team-t`) exist so "running" is one
  green everywhere instead of a hand-picked emerald per component. Geist Sans for everything;
  Geist Mono only for machine text — commands, ids, telemetry. Phosphor icons stay.
- **Narrowed to one world, 2026-09-03 — the Broadcast direction.** The dashboard is a
  scoreboard at stadium scale that you *change*: the mode, the map, the teams, the round
  limit and the series are edited in the band, in place, at the size they are worth. Two
  consequences worth writing down, because they are commitments and not styling:
  - **One theme, dark.** Both themes used to be real and the default followed the operating
    system. A stage is a lit thing in a dark room, so the panel forces dark. The light
    tokens remain because Settings and History are still built from them.
  - **The sidebar-plus-top-bar shell is gone.** A wordmark, a two-item rail and a ⌘K chip.
    The panel is three destinations now — the dashboard, History, Settings — because
    everything else turned out to be a way of editing the match already running.

## Evidence on Hand

- Official CS2 map tile art at `public/maps/official/<map>.png`, mapped by
  `lib/maps/official-art.ts`.
- Real telemetry to design against: container CPU/mem, `srcds` FPS, per-player ping and
  K/D/A, steamcmd byte progress, Steam build numbers.
- README documents real, non-obvious behaviour (update semantics, state derivation table,
  port table) that the UI may draw on.
- No testimonials, no users beyond the owner, no benchmarks, no pricing, no hosted service.
  None may be invented.

## Product Principles

1. **Never let unknown read as fine.** Every state the panel shows must be derived, and an
   underdetermined state says so rather than picking the reassuring one.
2. **Say what the button will do to the running match.** Destructive-to-players actions
   name their blast radius before the click, not in a toast afterward.
3. **A stranger's first install must be legible.** The panel is distributed software; a
   fresh, empty, still-downloading server is a first-class screen, not an edge case.
4. **Reach for the thing you need in one move.** The mid-match moments — kick, map, pause,
   restart — must not be several navigations deep. Taken to its conclusion in the Broadcast
   redesign: they are not on another screen at all, they are on the scoreboard.
5. **The server is always running something.** There is no "start from scratch" — every
   setup is a modification of what is live. So picking teams, naming them and choosing a
   series length are edits to the thing already on screen, staged in the same dock as the
   mode and the map, and applied together.
6. **The console command is part of the interface.** Admins trust the panel because it shows
   the RCON it sends; never hide the mechanism to look tidier.

## Accessibility & Inclusion

No user-specific requirement was established. The panel is used one-handed on a phone
mid-match, so touch targets and thumb reach are a real constraint — the reason for the
fixed bottom action bar under `md`, and for the dock pinning itself above the home indicator
rather than under it.

It used to follow the operating system's theme, on the reasoning that it is read on a bright
screen before a session and in a dark room at 2am. That was given up deliberately when the
panel became a stage: one world, dark, so the state colours mean the same thing at every hour
instead of two. The cost is real and is accepted — the light-room reading is now a dark
surface at full brightness, and every state colour is held to contrast against `--stage`
rather than against two grounds at once.
