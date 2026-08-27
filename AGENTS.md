<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Deployment

Deployed to a **Proxmox LXC** (Debian, unprivileged, `features: nesting=1`) running Docker CE and
the stock `docker-compose.yml`. `keyctl` turned out not to be needed. Host-specific addresses live
outside this repo; `scripts/deploy-lxc.sh` reads `SIDEARM_HOST`.

Docker-in-LXC is not optional: `lib/cs2/docker.ts` drives the Docker API against a container
literally named `cs2`, which powers the dashboard CPU/memory tiles, Start/Stop/Restart and the update
flow. Without it those all fail while RCON, chat and the console keep working — a confusing
half-broken panel rather than an obvious one.

Iterate with `./scripts/deploy-lxc.sh [branch]`: it rebuilds only `panel` and leaves `cs2` running,
so nothing re-downloads and no match is interrupted (~90s).

- **Never `docker compose pull` on the server.** `docker compose build panel` tags the local image
  as `ghcr.io/tduarte/sidearm:latest`; a pull replaces your build with CI's. Since both images are
  now published, a pull also recreates `cs2` and drops everyone connected — this rule is the only
  thing preventing that, where the cs2 image used to be unpullable by construction.
- **`docker compose build cs2` drops every connected player**, because rebuilding recreates the
  container. It is never part of a routine deploy: `./scripts/deploy-lxc.sh --with-cs2` is opt-in,
  and asks first with a live headcount from an A2S query. Only the plugin stack lives in that
  image, so a panel change never needs it.
- **Never run `docker-compose.dev.yml` there** — its stub uses `container_name: cs2` and collides
  with the real server.
- **Editing `docker-compose.yml` changes the `cs2` service hash**, so even `docker compose up -d
  panel` recreates the CS2 container and drops players. Switching between branches that differ in
  that file causes surprise restarts.
- On a **ZFS-backed** rootfs, verify `docker info` reports `overlayfs`/`overlay2` and not `vfs`.

## The CS2 image: plugins

`docker/cs2/` layers pinned Metamod / CounterStrikeSharp / MatchZy onto the upstream image. Three
things about it are load-bearing and non-obvious:

- **The install cannot be a Docker layer.** `cs2-data` is mounted over `/home/steam/cs2-dedicated`,
  and Docker seeds a named volume from the image only when the volume is *empty* — this one holds
  70 GB. So the image carries the artifacts at `/opt/sidearm/plugins` and `install-plugins.sh`
  copies them in at boot, from the base image's `pre.sh` hook (after `steamcmd`, before the server
  starts). Mounting the volume `rw` on the panel or bind-mounting it changes *access*, not this.
- **Every CS2 update rewrites `gameinfo.gi`** and silently drops the Metamod search path. Since
  applying a CS2 update *is* a container restart here, the failure would land unattended: a server
  that comes back healthy, listening, and with no plugins. The installer re-applies the line every
  boot for exactly that reason — do not "optimise" it to run once.
- **`install-plugins.sh` is sourced, not executed**, so it must never call `exit` and must not set
  `set -e`. A server without plugins is bad; a server that will not boot is worse.

The image is **published as `ghcr.io/tduarte/sidearm-cs2`**, built by CI on changes under
`docker/cs2/`. CI asserts the archives unpacked where the installer looks *before* pushing, because
publishing an image with an empty plugin tree is worse than publishing nothing.

Publishing exists so a first install does not depend on `mms.alliedmods.net` and two GitHub release
URLs being up. Compose sets both `image:` and `build:`, which means it **pulls when the tag exists
and builds when it does not** — verified, not assumed — so `docker compose up` works during the
window before a new tag is published and `docker compose build cs2` still overrides it locally.

The trade this makes: the image used to be unpullable by construction (an unqualified
`sidearm/cs2:latest` with no registry), which structurally prevented a stray pull from recreating
the container. That protection is now a documented rule rather than a property of the tag.

## The joedwards32/cs2 image

- **Ships no `nc` and no `curl`.** The healthcheck must use bash's `/dev/tcp` (bash is present). A
  `nc`-based check exits 127 forever and the container is never healthy.
- **Workshop content is only wired in at boot**, as `+host_workshop_map` /
  `+host_workshop_collection` launch args built from `CS2_HOST_WORKSHOP_*`. Changing those needs a
  container recreate, which the panel cannot do — so the panel issues `host_workshop_map <id>` over
  RCON at runtime instead (`lib/cs2/workshop.ts`). `ds_workshop_changelevel` / `ds_workshop_listmaps`
  only reach maps in a boot-configured collection and are useless here.
- `host_workshop_map` **downloads before it loads** — a first fetch takes ~a minute. Do not conclude
  it failed because the map has not changed yet. An `[S_API FAIL] ... SteamAPI_Init` line in the log
  during this is benign.
- **`SRCDS_TOKEN` (GSLT) is a launch argument**, so rotating it needs
  `docker compose up -d --force-recreate cs2`, not a restart.
- A **dead GSLT** looks like `Cert request for invalid failed with reason code 5005` /
  `We're not logged into Steam` on repeat, with `VAC: off` in an A2S reply. Steam reclaims unused
  tokens; reissue at steamcommunity.com/dev/managegameservers. A healthy server logs
  `Gameserver logged on to Steam, assigned identity steamid:...` and reports `secure public` in
  RCON `status`.

## MatchZy: what it owns, and what it will not tell you

- **`get5_status` is empty in pug mode.** It reports `gamestate: "none"` with every field null unless a
  Get5-style match config has been *loaded*. A full `.start` pug — knife round, hostname takeover, a
  row in MatchZy's own database — reports nothing. Verified on the live server. So it is a match-state
  source only for panel-loaded matches, and a plugin-liveness probe otherwise.
- **`matchid` must be an integer.** The Get5 spec says string; MatchZy answers
  `[LoadMatchDataCommand] matchid should be an integer!` and loads nothing. The panel keeps a numeric
  `match_number` beside its human-readable id for this.
- **MatchZy rewrites `hostname`** from `matchzy_hostname_format` on every match start. Its default is
  `MatchZy | {TEAM1} vs {TEAM2}`. The cvar **cannot be cleared over RCON** — CS2 treats a bare or `""`
  argument as a read — so `putConfig` points the format at the panel's own hostname instead.
- **Match stats live in MatchZy's SQLite**, not in the webhook (eight events, no retry, no ordering)
  and not in `get5_status`. The panel reads it through the existing `/cs2:ro` mount. Steam64 columns
  must be read with `safeIntegers`, and its `DATETIME` values are UTC with no zone marker.
- While a match is loaded MatchZy owns the map cycle, ~100 gameplay cvars (`live.cfg`) and
  `tv_record`. `matchzyOwnsMatch()` in `real.ts` is the gate; rotation, config re-apply and demo
  control all check it.

## Verifying a running server

Query it from outside with an **A2S_INFO** UDP packet (`\xFF\xFF\xFF\xFF\x54Source Engine
Query\x00`) to the public IP — that traverses the router exactly like a real client and needs no
game install. It reports name, map, player count and the VAC flag. RCON is deliberately unpublished,
so ad-hoc RCON has to run from inside the compose network.

## Learned User Preferences

- Prefer `npm` and `npx` over `pnpm` for scripts and CLI tooling in this workspace.
- TanStack Query v5: prefer `isPending` over `isLoading` when gating UI on having no cached data yet (e.g. skeletons).

## Learned Workspace Facts

- shadcn theme tokens in `app/globals.css` are full colors (often `oklch(...)`), not HSL triples; SVG/CSS should use `var(--primary)` (and similar) directly—wrapping in `hsl(var(--primary))` can render incorrectly.
- This repo is a Next.js app: an admin-style UI for a Counter-Strike 2 dedicated server (project name: sidearm).
- For design tasks, **check the [shadcn registry](https://ui.shadcn.com/) and docs first** (blocks, charts, component pages). Prefer installing or adapting what exists—most pieces are solid as-is or need only light tweaks—before hand-rolling comparable UI.
- Dashboard memory (`MemoryStatCard` in `components/memory-stat-card.tsx`) follows the shadcn **Pie Chart - Donut** pattern: rows include `fill: "var(--color-…)"`, `chartConfig` maps `used` / `free` to `var(--chart-1)` / `var(--chart-4)`, `Pie` with `dataKey="mb"` / `nameKey="segment"` and `innerRadius={60}` (no `Cell`). Center KPI is HTML overlay text.
- Live `status.update` WebSocket handling is centralized in `components/status-live-sync.tsx` (mounted from `components/providers.tsx`); `useServerStatus` is query-only—avoid attaching per-component `status.update` listeners.
- Official map tile art is under `public/maps/official/<map>.png`; `getOfficialMapArtPath` in `lib/maps/official-art.ts` maps internal map names to those paths.
- Image ownership must be set with `COPY --chown`, never a trailing `chown -R` over `/app`: on
  overlayfs each ownership change forces a copy-up, so recursing through `node_modules` rewrites
  the whole dependency tree — measured at 607s on a ZFS-backed LXC versus 0.3s.
- `PANEL_TRUSTED_CIDRS` matches the **real TCP peer address**, never `X-Forwarded-For` (which is
  attacker-controlled). `server.ts` stamps `x-sidearm-peer` from the socket and deletes any inbound
  copy first — that delete is what prevents spoofing, so do not remove it. The bypass is therefore
  useless behind a reverse proxy, and listing a proxy's own address would exempt the entire
  internet.
