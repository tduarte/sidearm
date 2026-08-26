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
  as `ghcr.io/tduarte/sidearm:latest`; a pull replaces your build with CI's.
- **Never run `docker-compose.dev.yml` there** — its stub uses `container_name: cs2` and collides
  with the real server.
- **Editing `docker-compose.yml` changes the `cs2` service hash**, so even `docker compose up -d
  panel` recreates the CS2 container and drops players. Switching between branches that differ in
  that file causes surprise restarts.
- On a **ZFS-backed** rootfs, verify `docker info` reports `overlayfs`/`overlay2` and not `vfs`.

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
