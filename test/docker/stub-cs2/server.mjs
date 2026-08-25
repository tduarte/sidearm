/**
 * Stub CS2 dedicated server.
 *
 * Speaks enough of the Source RCON protocol for the panel to connect, answers
 * `status` with a realistic roster, and — crucially — honours
 * `logaddress_add_http` the way CS2 does: once the panel registers its ingest
 * URL and enables logging, this process POSTs synthetic gameplay to it.
 *
 * That makes the compose stack a genuine end-to-end exercise of the real image,
 * the real socket proxy and the real network path, without the ~40 GB CS2
 * game-file download.
 *
 * Plain ESM JavaScript with no dependencies, so the container needs no build step.
 */

import net from "node:net";

const PORT = Number(process.env.RCON_PORT || 27015);
const PASSWORD = process.env.CS2_RCONPW || "test-password";
const HOSTNAME = process.env.CS2_SERVERNAME || "sidearm (stub cs2)";
const MAP = process.env.CS2_STARTMAP || "de_mirage";

const SERVERDATA_AUTH = 3;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_RESPONSE_VALUE = 0;
const ID_AUTH = 2457;

function encode(type, id, body) {
  const size = Buffer.byteLength(body) + 14;
  const buf = Buffer.alloc(size);
  buf.writeInt32LE(size - 4, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  buf.write(body, 12, size - 2, "ascii");
  buf.writeInt16LE(0, size - 2);
  return buf;
}

// ---------------------------------------------------------------------------
// World state
// ---------------------------------------------------------------------------

const PLAYERS = [
  { userId: 2, name: "s1mple", steamId: "[U:1:1000001]", team: "CT", ping: 12 },
  { userId: 3, name: "ZywOo", steamId: "[U:1:1000002]", team: "CT", ping: 18 },
  { userId: 4, name: "NiKo", steamId: "[U:1:1000003]", team: "CT", ping: 31 },
  { userId: 5, name: "device", steamId: "[U:1:1000004]", team: "TERRORIST", ping: 24 },
  { userId: 6, name: "broky", steamId: "[U:1:1000005]", team: "TERRORIST", ping: 44 },
  { userId: 7, name: "ropz", steamId: "[U:1:1000006]", team: "TERRORIST", ping: 27 },
];

const WEAPONS = ["ak47", "m4a1", "awp", "deagle", "usp_silencer", "glock"];
let score = { ct: 0, t: 0 };
let round = 0;

function statusOutput() {
  const rows = PLAYERS.map(
    (p) =>
      `# ${p.userId} "${p.name}" ${p.steamId} 12:34 ${p.ping} 0 active 786432 10.0.0.${p.userId}:27005`,
  ).join("\n");
  return [
    `hostname: ${HOSTNAME}`,
    "version : 1.40.7.3/14073 9945 secure",
    "os      : Linux",
    "type    : community dedicated",
    `map     : ${MAP}`,
    `players : ${PLAYERS.length} humans, 0 bots (10/0 max) (not hibernating)`,
    "",
    "# userid name uniqueid connected ping loss state rate adr",
    rows,
  ].join("\n");
}

function respond(command) {
  const verb = command.trim().split(/\s+/)[0];
  if (verb === "status") return statusOutput();
  if (verb === "game_type") return `"game_type" = "0"\n"game_mode" = "1"`;
  return `${verb}: stub ok`;
}

// ---------------------------------------------------------------------------
// Log emission — mirrors CS2's logaddress_add_http behaviour
// ---------------------------------------------------------------------------

let ingestUrl = null;
let logging = false;

/** `L MM/DD/YYYY - HH:MM:SS.mmm - <body>` — the Source log line format. */
function logLine(body) {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, "0");
  const stamp =
    `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()} - ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
  return `L ${stamp} - ${body}`;
}

function tok(p) {
  return `"${p.name}<${p.userId}><${p.steamId}><${p.team}>"`;
}

async function post(lines) {
  if (!ingestUrl || !logging || lines.length === 0) return;
  try {
    const res = await fetch(ingestUrl, { method: "POST", body: lines.join("\n") });
    if (!res.ok) console.log(`[stub-cs2] ingest responded ${res.status}`);
  } catch (err) {
    console.log(`[stub-cs2] ingest POST failed: ${err.message}`);
  }
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Announces the roster once logging turns on, so the panel learns teams. */
async function announceRoster() {
  const lines = [];
  for (const p of PLAYERS) {
    lines.push(logLine(`${tok(p)} entered the game`));
    lines.push(
      logLine(
        `"${p.name}<${p.userId}><${p.steamId}><Unassigned>" switched from team <Unassigned> to <${p.team}>`,
      ),
    );
  }
  lines.push(logLine(`World triggered "Game_Commencing"`));
  lines.push(logLine(`World triggered "Match_Start" on "${MAP}"`));
  await post(lines);
}

const CHATTER = ["gg", "nice one", "rotate B", "one left", "eco", "go go go", "nt"];

/** One round: a few kills, some chatter, then a round win with the new score. */
async function playRound() {
  const cts = PLAYERS.filter((p) => p.team === "CT");
  const ts = PLAYERS.filter((p) => p.team === "TERRORIST");
  const lines = [logLine(`World triggered "Round_Start"`)];

  const speaker = pick(PLAYERS);
  lines.push(logLine(`${tok(speaker)} say "${pick(CHATTER)}"`));
  const teamSpeaker = pick(PLAYERS);
  lines.push(logLine(`${tok(teamSpeaker)} say_team "${pick(CHATTER)}"`));

  const ctWins = Math.random() > 0.5;
  const winners = ctWins ? cts : ts;
  const losers = ctWins ? ts : cts;

  for (let i = 0; i < 3; i += 1) {
    const attacker = pick(winners);
    const victim = pick(losers);
    lines.push(
      logLine(
        `${tok(attacker)} [${i * 10} ${i * 20} 64] killed ${tok(victim)} [${i * 5} ${i * 7} 64] with "${pick(WEAPONS)}"`,
      ),
    );
    const helper = pick(winners);
    if (helper !== attacker) {
      lines.push(logLine(`${tok(helper)} assisted killing ${tok(victim)}`));
    }
  }

  if (ctWins) score.ct += 1;
  else score.t += 1;
  round += 1;

  const team = ctWins ? "CT" : "TERRORIST";
  const notice = ctWins ? "SFUI_Notice_CTs_Win" : "SFUI_Notice_Terrorists_Win";
  lines.push(
    logLine(`Team "${team}" triggered "${notice}" (CT "${score.ct}") (T "${score.t}")`),
  );
  lines.push(logLine(`World triggered "Round_End"`));

  await post(lines);
  console.log(`[stub-cs2] round ${round} -> CT ${score.ct} : T ${score.t}`);

  // Short match so a full lifecycle (including history) completes quickly.
  if (score.ct >= 5 || score.t >= 5) {
    await post([
      logLine(
        `Game Over: competitive mg_active ${MAP} score ${score.ct}:${score.t} after ${round} min`,
      ),
    ]);
    console.log("[stub-cs2] match over, resetting");
    score = { ct: 0, t: 0 };
    round = 0;
    setTimeout(() => void announceRoster(), 5000);
  }
}

// ---------------------------------------------------------------------------
// RCON server
// ---------------------------------------------------------------------------

const server = net.createServer((socket) => {
  let authed = false;
  let buf = Buffer.alloc(0);

  socket.on("error", () => {});
  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 4) return;
      const size = buf.readInt32LE(0);
      if (buf.length < size + 4) return;

      const packet = buf.subarray(0, size + 4);
      buf = buf.subarray(size + 4);

      const id = packet.readInt32LE(4);
      const type = packet.readInt32LE(8);
      const body = packet.toString("ascii", 12, packet.length - 2);

      if (type === SERVERDATA_AUTH) {
        authed = body === PASSWORD;
        console.log(`[stub-cs2] auth ${authed ? "ok" : "FAILED"}`);
        socket.write(encode(SERVERDATA_AUTH_RESPONSE, authed ? ID_AUTH : -1, ""));
        continue;
      }

      if (type !== SERVERDATA_EXECCOMMAND || !authed) continue;

      const addr = /^logaddress_add_http\s+"?([^"\s]+)"?/.exec(body);
      if (addr) {
        ingestUrl = addr[1];
        console.log(`[stub-cs2] log ingest registered: ${ingestUrl}`);
      } else if (/^log\s+on/.test(body)) {
        logging = true;
        console.log("[stub-cs2] logging enabled");
        setTimeout(() => void announceRoster(), 1000);
      }

      socket.write(encode(SERVERDATA_RESPONSE_VALUE, id, respond(body)));
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[stub-cs2] RCON listening on ${PORT}`);
});

// Drive the match forward.
setInterval(() => {
  if (logging) void playRound();
}, 8000);
