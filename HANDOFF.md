# Handoff — sidearm backend phase

Pick this up fresh; no conversation history required.

## TL;DR

Frontend v1 is shipped and merged. The panel now runs over a real HTTP +
WebSocket backend with a runtime `API_MODE=mock|real` switch (Phase A) and a
3-service docker compose stack scaffolded (Phase B). The CS2 adapter itself
— RCON, log ingest, Docker orchestration, SQLite — has not been written
yet. That's Phases C–G below.

**Current branch:** `main` @ `8a36202`.

## Snapshot of what's wired today

### Working

- `npm run dev` launches `tsx server.ts`, a custom Next.js 16 server that
  attaches a WebSocket server on `/ws` and kicks off the mock emitter once
  per process when `API_MODE !== "real"`. Verified: REST 200s, WS frames,
  mutation round-trips, dashboard + all pages render.
- 18 REST routes under `app/api/**` delegate to `lib/api/server/index.ts`,
  which in turn dispatches to `lib/api/server/mock.ts` today and a
  to-be-written real adapter later.
- `docker compose config` validates. `docker compose up --build` successfully
  builds the panel image on a Mac; CS2 image pulls and starts. **macOS host
  hit unrelated runtime issues — user is moving to Linux for the integration
  work, hence this handoff.**
- `.env` exists locally (gitignored). `RCON_PASSWORD` and `LOG_INGEST_SECRET`
  are already populated with 48-hex random values. `GSLT` is blank — paste
  one from <https://steamcommunity.com/dev/managegameservers> (appid 730)
  before friends can connect via the public Steam master.

### Stubbed but will throw if exercised

- `API_MODE=real` path in `lib/api/server/index.ts` throws "not implemented"
  — nothing has been wired yet. Phase C fills this in.
- Ports exposed: `3000/tcp` (panel), `27015/udp` + `27020/udp` (CS2 game +
  SourceTV). RCON (27015/tcp) lives only on the internal compose network.

## Architecture recap

```
Browser ──HTTP──▶ /api/*    ──▶ lib/api/server (mock | real)
       ◀──WS──── /ws       ──▶ lib/ws/server  (bus.subscribe → broadcast)
                                         ▲
                                         │ mock-emitter (dev)
                                         │ or real CS2 adapter (Phase C+)
```

The swap boundaries the real backend targets:

- `lib/api/server/index.ts` — dispatches by `process.env.API_MODE`.
  Today: `mock` → `mockAdapter`, `real` → throws.
- `lib/ws/bus.ts` — typed event bus; `lib/ws/server.ts` subscribes once and
  broadcasts every emission to all WS clients. Real adapter pushes events
  here instead of the mock emitter.
- `lib/api/types.ts` — typed contract (REST shapes + `WsEvent` union). Do
  **not** add ad-hoc types in components; the single source of truth is here.

## Phase plan (remaining)

Lifted from `~/.claude/plans/this-project-will-be-imperative-moler.md`. The
decisions below are locked — don't revisit without asking.

**Locked decisions**

- Monolith Next.js custom server + `ws` on the same HTTP server.
- Panel orchestrates the CS2 container via `tecnativa/docker-socket-proxy`
  (the panel never touches `/var/run/docker.sock` directly).
- SQLite via `better-sqlite3`.
- CS2 image: `joedwards32/cs2`.
- RCON library: `rcon-srcds` (handles CS2 multi-packet fragmentation that
  `rcon-client` misses).
- Log ingestion: `logaddress_add_http` POSTing to `/api/ingest/logs/<secret>`.
- Docker library: `dockerode`. Hardcoded allowlist `['cs2']`.
- Swap is runtime-flagged via `API_MODE=mock|real`. Mock stays shippable.

### Phase C — RCON adapter + Docker stats merge

1. `npm install rcon-srcds dockerode better-sqlite3 && npm install -D @types/dockerode @types/better-sqlite3`.
2. `lib/cs2/rcon.ts` — singleton `rcon-srcds` client against
   `${RCON_HOST}:${RCON_PORT}` with `${RCON_PASSWORD}`. Exp-backoff reconnect
   (cap 30s), queue commands during disconnect, **treat no auth response in
   2s as failure** (CS2 fails auth silently on some builds). Expose
   `rconExec(cmd: string): Promise<string>`.
3. `lib/cs2/status.ts` — parse RCON `status` + `stats` into `ServerStatus` +
   `Player[]`. Merge with `GET /containers/<name>/stats?stream=false` from
   `dockerode` for CPU% and memMb (subtract `cache` from RSS).
4. `lib/cs2/docker.ts` — `new Docker({ host: ..., port: ... })` against
   `DOCKER_HOST=tcp://docker-proxy:2375`. Methods: `start`, `stop`,
   `restart`, `inspect`, `stats`, `logs`. **Never accept container id from
   the client** — hardcode `['cs2']` allowlist.
5. Implement `realAdapter` in `lib/api/server/real.ts` fulfilling the same
   shape as `mockAdapter`. `lib/api/server/index.ts` imports it.
6. Poll loop in `server.ts` (only under `API_MODE=real`): Docker stats every
   5s, RCON `stats` every 10s, `status` every 2s. Each tick broadcasts a
   `status.update` event via `bus.emit`.
7. Verify: UI dashboard + players page show real server state. Start / Stop
   / Restart buttons actually drive the `cs2` container.

### Phase D — Log ingest + chat/console stream

- `POST /api/ingest/logs/[secret]/route.ts`. 404 on secret mismatch.
- `lib/cs2/log-parser.ts` — regex line parser → typed `WsEvent`s. Unit-test
  these patterns:
  - Chat: `"NAME<uid><STEAMID><TEAM>" say "msg"` (also `say_team`).
  - Kills, `entered the game`, `disconnected`.
  - `World triggered "Round_Start"` / `"Round_End"` → `match.phase` /
    `match.score`.
  - Map changes.
- Ingest handler: parse → emit to `bus` → persist chat rows to SQLite.
- On first RCON connect, exec:
  ```
  logaddress_add_http http://panel:3000/api/ingest/logs/${LOG_INGEST_SECRET}
  logaddress_enable_http 1
  log on
  ```
- Verify: real chat in-game surfaces in `/history` chat tab; `/console`
  live-tails; player join/leave fires in UI.

### Phase E — SQLite persistence

- `lib/db/client.ts` — `better-sqlite3` singleton at `SQLITE_PATH` (default
  `/data/sidearm.db` in the panel container).
- `lib/db/schema.ts` + `lib/db/migrations/*.sql` — tables:
  `chat_messages`, `matches`, `match_rounds`, `saved_config`. `migrate()`
  runs on boot.
- Rewire `api.getChat` / `api.getHistory` to read from DB. Log parser
  writes on the fly.
- Match lifecycle recorder: on `match.phase === "ended"` emit a row into
  `matches` with winner + score + duration.
- Verify: chat survives panel restart; history list shows real completed
  matches.

### Phase F — Config write-back

- `PUT /api/config`:
  1. Write `sidearm.cfg` into `${CS2_DATA}/cfg/` with hot-reloadable cvars.
     Requires flipping the `cs2-data` mount to `rw` (currently `ro`) or
     mounting only `cfg/` writable.
  2. Persist a `saved_config` row in SQLite.
  3. `rconExec("exec sidearm.cfg")`.
- Classify cvars:
  - **Hot-reload:** `hostname`, `sv_password`, `rcon_password`, `mp_*`,
    `sv_cheats`, most gameplay cvars.
  - **Restart required:** `-tickrate` (launch arg, not cvar),
    `-maxplayers_override`, `sv_setsteamaccount` (GSLT), map group,
    plugin loads. Light up the top-bar restart button and banner.
- Workshop subscribe: append to `host_workshop_collection`; `changelevel
  workshop/<id>` at map swap.
- Verify: hostname change in UI → top bar updates within one status tick.

### Phase G — Hardening + docs

- Bearer-token auth on `/api/*` via a small middleware. Uses
  `PANEL_ADMIN_TOKEN` in `.env` (already plumbed through compose).
- RCON command allowlist/denylist: explicitly deny `quit`, `exit`,
  `sv_setsteamaccount`, `+sv_downloadurl` writes.
- Finalize README: first-run, GSLT, troubleshooting (healthcheck red, RCON
  auth drop, 40 GB download).
- Note: self-hosted by design — not a Vercel deploy target (we need the
  Docker socket and persistent local FS).

## Known caveats to keep in mind

- **Knife rounds aren't native to CS2.** The cvar-only approach (strip
  weapons via `mp_ct_default_primary ""` etc., `mp_restartgame`) is brittle.
  Real competitive flow needs a match plugin (Get5 / MatchZy). Out of scope
  for this phase — flag it in `/match` copy.
- **GSLT rotation requires a container recreate**, not just `restart`:
  `docker compose up -d --force-recreate cs2`.
- **CS2 game-file volume is ~40 GB.** First `docker compose up` downloads
  the lot; subsequent runs reuse `cs2-data`.
- **CS2 RCON auth drops silently on some builds.** The reconnect wrapper
  must treat "no auth response in 2s" as failure.

## Files to create / modify (Phase C–G)

| Path                                            | Change |
| ----------------------------------------------- | ------ |
| `lib/cs2/rcon.ts`                               | new    |
| `lib/cs2/status.ts`                             | new    |
| `lib/cs2/docker.ts`                             | new    |
| `lib/cs2/log-parser.ts`                         | new + unit tests |
| `lib/api/server/real.ts`                        | new    |
| `lib/api/server/index.ts`                       | import `real` and use it when `API_MODE=real` |
| `lib/db/client.ts`, `schema.ts`, `migrations/`  | new    |
| `app/api/ingest/logs/[secret]/route.ts`         | new    |
| `server.ts`                                     | add real-mode poll loop |
| `docker-compose.yml`                            | flip `cs2-data` mount to `rw` (or mount `cfg/` writable) in Phase F |
| `package.json`                                  | `rcon-srcds`, `dockerode`, `better-sqlite3`, `@types/*` |

## First moves when resuming

1. `cd` into the repo, `git pull`, then `cat HANDOFF.md` (this file).
2. Confirm `.env` still has `RCON_PASSWORD` + `LOG_INGEST_SECRET`. `GSLT` is
   optional for local LAN testing — friends-over-internet needs a real one.
3. `docker compose up -d --build`. Watch `docker compose logs -f cs2` for
   the 40 GB download. Once it's `Loading "VProf_*"` and listening on 27015,
   the CS2 side is healthy.
4. `docker exec -it cs2 /bin/bash` → `rcon status` inside to prove RCON is
   reachable from the internal network (optional sanity check).
5. Start Phase C: `npm install rcon-srcds dockerode better-sqlite3`, write
   `lib/cs2/rcon.ts`, unit test it against the live CS2, then build outward.

## Pointers to key existing code

- Typed contract: `lib/api/types.ts`
- Mock adapter (target shape for the real one): `lib/api/server/mock.ts`
- Swap dispatcher: `lib/api/server/index.ts`
- WS event bus: `lib/ws/bus.ts`, `lib/ws/server.ts`
- Custom Next.js entrypoint: `server.ts`
- Compose stack: `docker-compose.yml`
- Panel image: `Dockerfile`
- Env secrets (gitignored): `.env` — template at `.env.example`

## User preferences + learned facts

Also see `AGENTS.md`:

- Prefer `npm` / `npx` over `pnpm` in this workspace.
- TanStack Query v5: prefer `isPending` over `isLoading` for "no cached data
  yet" gating.
- shadcn theme tokens in `app/globals.css` are full `oklch(...)` colors;
  use `var(--primary)` directly — don't wrap in `hsl(var(--primary))`.
- For design tasks: check the shadcn registry first. Prefer installing /
  adapting over hand-rolling.
- Live `status.update` WS handling is centralised in
  `components/status-live-sync.tsx` (mounted from `components/providers.tsx`).
  Don't add parallel per-component listeners.
- Match screen uses a tile language, not button rows — extend via
  `components/match/match-action-tile.tsx` + `MatchActionGrid`.
