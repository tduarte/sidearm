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

Both are admins with full authority — the panel has no non-admin role. Access is a single
optional bearer token (`PANEL_ADMIN_TOKEN`), not per-user accounts.

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
  v5, custom `server.ts` with a `ws` server. Dark theme only today (`<html class="dark">`).
- The panel's authority ends at RCON and the Docker API. It **cannot** recreate the `cs2`
  container, so anything that is a launch argument (GSLT, workshop collection, maxplayers)
  cannot be changed from the UI at runtime.
- Docker-in-LXC is required; without the Docker socket the resource tiles and all lifecycle
  buttons fail while RCON keeps working — a half-broken panel, not an obviously dead one.
- RCON is deliberately unpublished outside the compose network.
- Explicitly undecided: whether Settings becomes real. `app/settings/page.tsx` is currently
  an unwired mock (admin username/password, notifications, autoscroll) that does not reflect
  how access actually works — the real mechanism is a single `PANEL_ADMIN_TOKEN` env var.

## Brand Commitments

- Name: **sidearm**, lowercase. Tagline in use: "CS2 panel". A sidearm is the pistol you
  fall back on — small, always on you, works when the primary does not. That is the panel's
  relationship to the server.
- Voice in the existing product is plain, precise and unhyped; it names the actual console
  command under each action (`mp_restartgame 1`) and states consequences before they happen
  ("Restarts the server immediately, players connected or not — you asked for it"). Keep it.
- No logo asset beyond a Phosphor `Crosshair` mark.
- **The incumbent visual identity is pinned by the user** (stated 2026-08-25): dark-only
  shadcn/ui on Tailwind v4, the amber/gold `--primary`, Geist Sans + Geist Mono, Phosphor
  icons, sidebar-plus-top-bar shell. Work improves structure, interaction, states and copy
  *inside* that identity; it is not a candidate for replacement.

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
   restart — must not be several navigations deep.
5. **The console command is part of the interface.** Admins trust the panel because it shows
   the RCON it sends; never hide the mechanism to look tidier.

## Accessibility & Inclusion

No user-specific requirement was established. The panel is used one-handed on a phone
mid-match, so touch targets and thumb reach are a real constraint, and it is read on a
bright screen in a dark room, which the dark-only theme already assumes.
