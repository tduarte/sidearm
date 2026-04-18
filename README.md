# sidearm

One-stop self-hosted Counter-Strike 2 server: a vanilla CS2 dedicated
server and a web admin panel, shipped together as a small docker compose
stack.

The panel is a Next.js 16 app that speaks RCON, ingests CS2 log events over
HTTP, and orchestrates the CS2 container through a socket-proxy so the
Start / Stop / Restart buttons in the UI are real.

## Run it

```bash
cp .env.example .env        # fill in GSLT + RCON_PASSWORD + LOG_INGEST_SECRET
docker compose up -d        # first pull downloads ~40 GB of CS2 game files
open http://localhost:3000  # panel
```

Connect to the server at `steam://connect/<your-host>:27015`.

### Required env vars

| Variable             | What                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `GSLT`               | Game Server Login Token from <https://steamcommunity.com/dev/managegameservers> (appid 730). |
| `RCON_PASSWORD`      | Long random string. The panel uses it internally; never exposed on the host network.         |
| `LOG_INGEST_SECRET`  | Shared secret for CS2's `logaddress_add_http` sink. `openssl rand -hex 24` is fine.           |
| `SERVER_PASSWORD`    | Public join password. Leave empty for open server.                                            |

### Ports

| Port         | Proto | What                  |
| ------------ | ----- | --------------------- |
| `3000`       | TCP   | Admin panel           |
| `27015`      | UDP   | CS2 game traffic      |
| `27020`      | UDP   | SourceTV relay        |

RCON lives on TCP 27015 inside the docker network — it is intentionally **not**
published to the host.

## Develop the panel locally

```bash
npm install
npm run dev                # API_MODE=mock by default (runs the mock emitter)
```

Everything works without a real CS2 server: the panel is wired to a typed mock
backend so the UX is fully usable for iteration. `API_MODE=real` points the
panel at a live CS2 container; use compose for that.

`npm run dev` launches a custom Next.js server (`server.ts`) that attaches a
WebSocket server on `/ws`. REST lives under `/api/*`.

## Architecture

```
Browser ──HTTP──▶ /api/*  ──▶ lib/api/server (mock | real)
       ◀──WS──── /ws     ──▶ lib/ws/server (bus → broadcast)
                                     ▲
                                     │ mock-emitter (dev)  or  CS2 adapter (prod)
```

Two swap boundaries the real backend targets:

- `lib/api/server/index.ts` — typed adapter dispatched by `API_MODE`.
- `lib/ws/bus.ts` — typed event bus the WS server broadcasts from.

Everything else (components, hooks, types) is shared.

## Known limits

- Knife rounds are faked with cvars — brittle for real competitive flow.
  Match plugins (Get5 / MatchZy) will land in a later phase.
- `GSLT` rotation requires `docker compose up -d --force-recreate cs2` because
  it's a launch argument, not a cvar.
- First `docker compose up` has a ~40 GB game-file download. Keep the volume.
