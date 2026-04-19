# sidearm

Self-hosted Counter-Strike 2 dedicated server with a web admin panel — shipped as a single `docker compose up`.

## Features

- **Live dashboard** — server state, CPU/RAM, FPS, player list, all pushed over WebSocket
- **Match control** — start/stop warmup, pause, switch maps, record demos
- **Player management** — kick players from the UI
- **RCON console** — run raw commands from the browser
- **Chat & history** — live in-game chat feed and per-match history
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
| `CS2_MAXPLAYERS` | No | Slot count (default: `10`) |
| `CS2_STARTMAP` | No | Starting map (default: `de_mirage`) |
| `PANEL_ADMIN_TOKEN` | No | Bearer token for `/api/*` auth (Phase G — leave blank during early setup) |

---

## Ports

| Port | Protocol | Description |
|---|---|---|
| `3000` | TCP | Admin panel |
| `27015` | UDP | CS2 game traffic |
| `27020` | UDP | SourceTV relay |

RCON (TCP 27015) is intentionally **not** published to the host — it only lives on the internal Docker network between the panel and the CS2 container.

---

## Docker images

Images are published automatically to the GitHub Container Registry on every push to `main` and on version tags.

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

**Friends can't connect over the internet**
Paste a valid GSLT into `.env`, then force-recreate the CS2 container: `docker compose up -d --force-recreate cs2` (it's a launch arg, not a hot cvar). Make sure UDP 27015 and 27020 are open on your firewall/router.

---

## Known limits

- **Knife rounds** are faked with cvars which is brittle for real competitive flow. Match plugins (Get5 / MatchZy) are out of scope for now — flagged in the match page.
- **GSLT rotation** requires a full container recreate, not just restart.
- **Config write-back** (Phase F) is not yet implemented — cvars are applied via RCON exec but not persisted to disk.
- **API auth** on `/api/*` (Phase G) is not yet implemented — don't expose port 3000 to the public internet until that ships.

---

## License

[AGPL-3.0](LICENSE)
