import net from "node:net";

/**
 * Minimal Source RCON server, good enough to drive `lib/cs2/rcon.ts` over a real
 * socket without a CS2 container.
 *
 * Wire format (little-endian): [size:i32][id:i32][type:i32][body:cstr][pad:u8]
 * where `size` excludes its own 4 bytes.
 *
 * `rcon-srcds` resolves an auth request only when it sees a packet of type
 * SERVERDATA_AUTH_RESPONSE carrying the literal id 2457, and resolves a command
 * when it sees a packet echoing the request's id with a size <= 3700.
 */

const SERVERDATA_AUTH = 3;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_RESPONSE_VALUE = 0;
const ID_AUTH = 2457;

function encode(type: number, id: number, body: string): Buffer {
  const size = Buffer.byteLength(body) + 14;
  const buf = Buffer.alloc(size);
  buf.writeInt32LE(size - 4, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  buf.write(body, 12, size - 2, "ascii");
  buf.writeInt16LE(0, size - 2);
  return buf;
}

export interface StubRcon {
  port: number;
  /** Commands received, in order — lets tests assert what the panel asked for. */
  commands: string[];
  close: () => Promise<void>;
}

export interface StubRconOptions {
  password?: string;
  /** Returns the canned output for a command, or "" if unknown. */
  respond?: (command: string) => string;
}

export function startStubRcon(opts: StubRconOptions = {}): Promise<StubRcon> {
  const password = opts.password ?? "test-password";
  const respond = opts.respond ?? (() => "");
  const commands: string[] = [];

  // `server.close()` only completes once every connection is gone, so track the
  // live sockets and destroy them explicitly on teardown — otherwise the RCON
  // client's still-open socket makes close() hang forever.
  const sockets = new Set<net.Socket>();

  const server = net.createServer((socket) => {
    let authed = false;
    let buf = Buffer.alloc(0);
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));

    socket.on("error", () => {
      /* client went away mid-test; nothing to do */
    });

    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);

      // Frame the stream properly — a single 'data' event may carry several
      // packets, or half of one.
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
          authed = body === password;
          // Real servers echo the request id on success and -1 on failure; the
          // client keys success off the literal ID_AUTH constant.
          socket.write(encode(SERVERDATA_AUTH_RESPONSE, authed ? ID_AUTH : -1, ""));
        } else if (type === SERVERDATA_EXECCOMMAND && authed) {
          commands.push(body);
          socket.write(encode(SERVERDATA_RESPONSE_VALUE, id, respond(body)));
        }
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") {
        reject(new Error("stub rcon failed to bind"));
        return;
      }
      resolve({
        port: addr.port,
        commands,
        close: () =>
          new Promise<void>((res) => {
            for (const s of sockets) s.destroy();
            sockets.clear();
            server.close(() => res());
          }),
      });
    });
  });
}

/** Canned `status` output in the CS2 hash-table layout. */
export function statusOutput(
  players: Array<{ userId: string; name: string; steamId: string; ping: number }>,
): string {
  const rows = players
    .map(
      (p) =>
        `# ${p.userId} "${p.name}" ${p.steamId} 01:23 ${p.ping} 0 active 786432 1.2.3.4:27005`,
    )
    .join("\n");
  return [
    "hostname: sidearm test",
    "version : 1.40.7.3/14073 9945 secure",
    "os      : Linux",
    "type    : community dedicated",
    "map     : de_mirage",
    `players : ${players.length} humans, 0 bots (10/0 max) (not hibernating)`,
    "",
    "# userid name uniqueid connected ping loss state rate adr",
    rows,
  ].join("\n");
}

/** Default responder covering the commands the poll loop issues. */
export function defaultResponder(
  players: Array<{ userId: string; name: string; steamId: string; ping: number }>,
) {
  return (command: string): string => {
    if (command === "status") return statusOutput(players);
    if (command.startsWith("game_type")) return `"game_type" = "0"\n"game_mode" = "1"`;
    return "";
  };
}
