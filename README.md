# sidearm

Self-hosted Counter-Strike 2 dedicated server with a web admin panel — shipped as a single `docker compose up`.

## Features

- **Live dashboard** — server state, CPU/RAM, FPS, player list, all pushed over WebSocket
- **Match control** — start/stop warmup, pause, switch maps, record demos
- **Player management** — kick players from the UI
- **RCON console** — run raw commands from the browser
- **Chat & history** — live in-game chat feed and per-match history
- **Competitive plugins built in** — Metamod, CounterStrikeSharp and MatchZy, pinned and installed on boot
- **One-command stack** — CS2 + panel + socket proxy in a single compose file

## Quick start

```bash
# 1. Clone
git clone https://github.com/tduarte/sidearm.git
cd sidearm

# 2. Configure
cp .env.example .env
# Edit .env — fill in GSLT, RCON_PASSWORD, LOG_INGEST_SECRET

# 3. Run
docker compose up -d

# 4. Open the panel
open http://localhost:3000
```

> **First boot:** CS2 game files are ~40 GB. `docker compose logs -f cs2` will show download progress. The panel comes up immediately; the CS2 side shows "starting" until the download finishes.

Connect players to the server at `steam://connect/<your-host>:27015`.

---

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `GSLT` | For internet play | Game Server Login Token — get one at [steamcommunity.com/dev/managegameservers](https://steamcommunity.com/dev/managegameservers) (app id 730). Leave blank for LAN. |
| `RCON_PASSWORD` | Yes | Long random string. Internal only — never exposed outside the Docker network. `openssl rand -hex 24` |
| `LOG_INGEST_SECRET` | Yes | Shared secret for the CS2 log HTTP sink. `openssl rand -hex 24` |
| `SERVER_PASSWORD` | No | Public join password. Empty = open server. |
| `SERVER_NAME` | No | Server browser name (default: `sidearm`) |
| `CS2_MAXPLAYERS` | No | Hard slot count, i.e. `-maxplayers` (default: `11`). GOTV takes one, so budget an extra slot — 11 fits a 5v5. |
| `CS2_STARTMAP` | No | Starting map (default: `de_mirage`) |
| `PANEL_ADMIN_TOKEN` | No | Bearer token for `/api/*` and `/ws`. Blank = open panel. When set, the UI prompts once and keeps an HttpOnly session cookie. |
| `PANEL_HTTPS` | No | Set to `1` when serving over HTTPS so the session cookie is marked `Secure`. |
| `SERVER_IP` | No | Public address for the connect URL. Set it to avoid an outbound lookup to api.ipify.org each poll. |
| `BIND_HOST` | No | Interface to bind (default `0.0.0.0`). Deliberately not `HOSTNAME`, which shells and Docker both set. |
| `CS2_AUTO_UPDATE` | No | `1` lets the panel restart the CS2 container by itself when a game update is pending **and** nobody is connected. Unset = surface the badge only. |
| `CS2_UPDATE_CHECK_MS` | No | How often to check for a CS2 update (default `900000`, 15 min). `0` disables the check. |

---

## CS2 updates

CS2 cannot be patched in place. The `joedwards32/cs2` image runs
`steamcmd app_update 730` from its entrypoint, so **restarting the container is
the update** — there is nothing to run against a live server, and a build change
needs a new `srcds` process anyway.

The panel therefore does not try to update anything. It answers a narrower
question: *is an update pending, and is now a good time?*

Every `CS2_UPDATE_CHECK_MS` it asks the server its build over RCON (`version`)
and passes that to Steam's public
[`ISteamApps/UpToDateCheck`](https://api.steampowered.com/ISteamApps/UpToDateCheck/v1/?appid=730&version=1)
endpoint — no API key, no GSLT. When a newer build exists:

- An **Update available** button appears in the top bar. Clicking it restarts the
  container immediately, players connected or not — you asked for it.
- With `CS2_AUTO_UPDATE=1`, the panel also restarts on its own, but **only** when
  the server is empty. Every other outcome (players connected, roster unknown,
  RCON silent, Steam unreachable, an unparseable build) defers the restart and is
  logged with the reason. The check fails safe: unknown never means "go ahead".

### While it is updating

A first boot pulls roughly 70 GB, and the container is `Running` for all of it
even though `srcds` is not listening — which is why the panel used to show a
green **Running** pill next to an `unknown` map for hours. Server state is now
derived from three signals rather than one:

| Container | RCON | Healthcheck | Panel shows |
|---|---|---|---|
| Running | answers | — | **Running** |
| Running | silent | starting / none | **Starting** |
| Running | silent | — (steamcmd progress in logs) | **Updating 68%** with the byte count |
| Running | silent | `unhealthy` | **Crashed** |

The percentage is scraped from the container's own boot logs
(`Update state (0x61) downloading, progress: …`), read only while RCON is silent
and scoped to the current boot — so a finished download cannot linger at a stale
percentage. Docker's healthcheck already debounces itself (`retries: 6` at 30s),
so `unhealthy` means three minutes of a closed game port; steamcmd progress is
checked first, because a long download fails that healthcheck for entirely
normal reasons.

### Container image updates are a separate thing

Watchtower refreshes the *images* in `docker-compose.yml`. It does **not** patch
Counter-Strike — the game arrives through steamcmd at boot, on a schedule
unrelated to image releases. It is opt-in:

```bash
docker compose --profile autoupdate up -d
```

Only services labelled `com.centurylinklabs.watchtower.enable=true` are touched,
which is `panel` alone — a wrapper-image bump must not recreate `cs2` mid-match.
Note that Watchtower needs the raw Docker socket read-write plus image-pull
rights, which is a considerably wider grant than the panel's socket proxy: the
panel only gets `CONTAINERS` and `POST`. `containrrr/watchtower` was archived in
December 2025, so the compose file uses the maintained community fork.

---

## Ports

| Port | Protocol | Description |
|---|---|---|
| `3000` | TCP | Admin panel |
| `27015` | UDP | CS2 game traffic |
| `27020` | UDP | GOTV / SourceTV |

RCON (TCP 27015) is intentionally **not** published to the host — it only lives on the internal Docker network between the panel and the CS2 container.

### GOTV

GOTV is on by default (`TV_ENABLE=1`). The upstream image ships it disabled, which
left `27020/udp` published with nothing behind it and made demo recording
impossible — `tv_record` needs GOTV running.

`TV_DELAY` defaults to **30 seconds** here rather than the image's `0`: with no
delay, anyone connecting to GOTV watches the game live and can call positions.

**GOTV occupies a player slot.** The server lists a `CSTV` client in slot 0, so
`CS2_MAXPLAYERS=10` leaves nine slots for people and a 5v5 will not fit. Budget
one extra slot for it — 11 for 5v5, 17 for a 16-player deathmatch. The panel
already reports the corrected figure: the player count on the dashboard shows
slots a human can actually take.

Every `TV_*` variable is a launch argument, so changing one needs
`docker compose up -d --force-recreate cs2` — do it while nobody is playing.
Turn GOTV off with `TV_ENABLE=0` in `.env` if you don't want it.

Recorded demos land in the CS2 volume. The panel mounts that volume **read-only**
at `/cs2` so it can list them and hand them to you from Match Control; without
the mount, recording still works but the files stay out of reach.

---

## Docker images

Two images, treated differently on purpose.

**The panel** is published to the GitHub Container Registry on every push to `main` and on version tags.

```bash
# Latest stable (built from main)
docker pull ghcr.io/tduarte/sidearm:latest

# Specific release
docker pull ghcr.io/tduarte/sidearm:1.0.0
```

The default `docker-compose.yml` uses the pre-built image — no local build needed:

```yaml
panel:
  image: ghcr.io/tduarte/sidearm:latest
```

To pin to a release, replace `latest` with the version tag (e.g. `1.0.0`).

**The CS2 server image is built locally and never published.** `docker-compose.yml` tags it `sidearm/cs2:latest` — an unqualified name with no registry behind it, so it can only come from `docker compose build cs2`. CI builds the same context on every change to `docker/cs2/` to prove the pinned plugin downloads still resolve, but deliberately does not push: a published copy is exactly what a stray `docker compose pull` would substitute for your build.

---

## Plugins

The CS2 image layers three pinned components onto `joedwards32/cs2`:

| | What it does |
|---|---|
| [Metamod:Source](https://www.sourcemm.net/) | The plugin loader CS2 itself has no notion of |
| [CounterStrikeSharp](https://github.com/roflmuffin/CounterStrikeSharp) | Runs .NET plugins on top of Metamod (bundles its own runtime) |
| [MatchZy](https://github.com/shobhit-pathak/MatchZy) | Competitive match flow: knife round, veto, pauses, backups, per-round stats |

Versions are pinned as `ARG`s at the top of `docker/cs2/Dockerfile`, so a plugin upgrade is a one-line commit with a history rather than something someone once did on a server by hand.

**Plugins are installed at boot, not baked into a layer.** The game files live in the `cs2-data` volume, which is mounted *over* the directory an image layer would write to, and Docker only seeds a named volume from the image when the volume is empty — so anything the image put there would be invisible. The image carries the artifacts at `/opt/sidearm/plugins`; `docker/cs2/install-plugins.sh` copies them into the volume from the base image's `pre.sh` hook, which runs after `steamcmd` and before the server starts.

That timing is the point. **Every CS2 update rewrites `gameinfo.gi`**, silently removing the search path Metamod needs — and the panel's own update flow is a container restart, so this would otherwise happen unattended, weeks later, producing a server that comes back healthy, accepts players, and has no plugins. The installer re-applies that line on every boot and skips the ~165 MB copy when the version stamp already matches.

Your edits to `cfg/MatchZy/*.cfg` survive an image upgrade (the config tree is copied with `cp -rn`, which never clobbers). The `addons/` tree is overwritten, because it belongs to the image.

To rebuild after a version bump — this recreates the container and drops everyone connected:

```bash
docker compose build cs2 && docker compose up -d cs2
docker compose logs --tail=50 cs2 | grep sidearm    # what the installer did
```

Or with the deploy script, which asks first and tells you how many people are on:

```bash
./scripts/deploy-lxc.sh --with-cs2
```

Verify from inside the container over RCON with `meta list` and `css_plugins list`.

---

## Architecture

```
Browser ──HTTP──▶  /api/*          ──▶  lib/api/server/real.ts
        ◀──WS────  /ws             ──▶  lib/ws/server.ts  (bus → broadcast)
                                              ▲
                                    poll loop (server.ts)
                                              │
                              ┌───────────────┴───────────────┐
                              │                               │
                         lib/cs2/rcon.ts             lib/cs2/docker.ts
                         (RCON + status)           (dockerode via proxy)
```

- **`lib/cs2/rcon.ts`** — singleton RCON client with exponential-backoff reconnect and command queue
- **`lib/cs2/docker.ts`** — Docker container controls (start/stop/restart/stats) through the socket proxy; hardcoded `['cs2']` allowlist
- **`lib/cs2/status.ts`** — parses `status` + `stats` RCON output, merges Docker CPU/mem
- **`lib/api/server/real.ts`** — the real backend adapter (same interface as the mock)
- **`lib/ws/bus.ts`** — typed event bus; the poll loop emits here, the WS server broadcasts to all clients
- **`docker-proxy`** — [tecnativa/docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) sits between the panel and `/var/run/docker.sock` to limit surface area

Switching between mock (dev) and real (prod) is a single env var:

```bash
API_MODE=mock  # default — full UI with fake data, no CS2 needed
API_MODE=real  # live CS2 via RCON + Docker
```

---

## Local panel development

You don't need a running CS2 server to work on the UI:

```bash
npm install
npm run dev        # starts with API_MODE=mock
open http://localhost:3000
```

The mock backend emits realistic fake events so every panel feature is exercisable. When you need to test against a real server, run the compose stack and the panel picks it up automatically (`API_MODE=real` is set in `docker-compose.yml`).

---

## Troubleshooting

**Panel shows "stopped" / health check red**
CS2 is still downloading game files. Check `docker compose logs -f cs2`. Once you see `VAC secure mode` or `Listening on 27015`, it's ready.

**RCON keeps failing to connect**
Some CS2 builds drop auth silently. The panel retries with exponential backoff (cap 30s) — give it a moment. Double-check `RCON_PASSWORD` in `.env` matches what CS2 got at startup. Changing it requires a container recreate: `docker compose up -d --force-recreate cs2`.

**Dashboard shows 0% CPU and 0 MB memory, Start/Stop do nothing**
The panel could not reach the Docker socket proxy. On SELinux hosts (Fedora,
RHEL, CentOS) the proxy is denied write access to `/var/run/docker.sock` and
every request 503s — check with
`docker logs sidearm-docker-proxy 2>&1 | tail`. Both compose files set
`security_opt: [label:disable]` on the proxy to fix this; if you wrote your own,
add it there.

**Friends can't connect over the internet**
Paste a valid GSLT into `.env`, then force-recreate the CS2 container: `docker compose up -d --force-recreate cs2` (it's a launch arg, not a hot cvar). Make sure UDP 27015 and 27020 are open on your firewall/router.

---

## Tests

```bash
npm test              # unit: log parser, status parser, RCON queue, sanitisers
npm run test:integration   # boots the panel against a stub RCON server
npm run test:all
```

The integration suite needs no CS2 and no Docker: it starts a stub Source RCON
server, boots the panel with `API_MODE=real` against it, and drives real log
POSTs through to WebSocket frames and SQLite. Set `PANEL_DEBUG=1` to see the
child process output.

### Full stack, without the 40 GB download

`docker-compose.dev.yml` builds the panel **from local source** (never from
ghcr.io) and swaps CS2 for a stub that speaks RCON and emits synthetic gameplay
logs:

```bash
docker compose -f docker-compose.dev.yml up --build -d
```

Then open <http://localhost:3001>. This exercises the real production image
(including the `better-sqlite3` native build on Alpine), the Docker socket proxy,
container start/stop/restart, and the full RCON + log-ingest + WebSocket path.

```bash
docker compose -f docker-compose.dev.yml down -v
```

---

## Known limits

- **Knife rounds without MatchZy** are approximated with cvars, which is brittle for real competitive flow — the match page says so. With the plugin loaded, MatchZy runs the knife round properly and the panel's own tiles stand down rather than fight it over the same cvars.
- **GSLT rotation** requires a full container recreate, not just a restart — it is a launch argument.
- **Launch-argument settings** (max players, ports, GOTV) cannot be hot-applied. The panel shows them read-only with the command to run on the host, rather than as fields that pretend to work.
- **`fps` and `tickrate` are reported as unknown, not guessed.** CS2 answers `stats` with an empty string, and there is no tickrate to read — `-tickrate` was a CS:GO launch argument and CS2 is 64-tick with sub-tick.
- **Log and `status` parsing is deliberately tolerant** of the layouts CS2 has shipped. Where a value cannot be read the panel reports *unknown* and takes no action on it — notably, the update check never auto-restarts on a build number it could not determine.

---

## License

[AGPL-3.0](LICENSE)
