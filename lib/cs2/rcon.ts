import Rcon from "rcon-srcds";

const HOST = process.env.RCON_HOST ?? "cs2";
const PORT = parseInt(process.env.RCON_PORT ?? "27015", 10);
const PASSWORD = process.env.RCON_PASSWORD ?? "";
const AUTH_TIMEOUT_MS = 2000;
const MAX_BACKOFF_MS = 30_000;

let client: Rcon | null = null;
let authenticated = false;
let connecting = false;
let backoff = 1000;
let commandQueue: Array<{
  cmd: string;
  resolve: (v: string) => void;
  reject: (e: unknown) => void;
}> = [];

async function connect(): Promise<void> {
  if (connecting) return;
  connecting = true;
  try {
    client = new Rcon({ host: HOST, port: PORT, timeout: AUTH_TIMEOUT_MS });
    await client.authenticate(PASSWORD);
    authenticated = true;
    backoff = 1000;
    console.log("[rcon] connected");
    flushQueue();
  } catch (err) {
    authenticated = false;
    client = null;
    console.error(`[rcon] connect failed, retry in ${backoff}ms:`, err);
    setTimeout(() => {
      connecting = false;
      connect();
    }, backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    return;
  }
  connecting = false;
}

function flushQueue() {
  const pending = commandQueue.splice(0);
  for (const item of pending) {
    execNow(item.cmd).then(item.resolve).catch(item.reject);
  }
}

async function execNow(cmd: string): Promise<string> {
  if (!client || !authenticated) throw new Error("RCON not connected");
  try {
    const result = await client.execute(cmd);
    return typeof result === "string" ? result : String(result);
  } catch (err) {
    authenticated = false;
    client = null;
    connecting = false;
    connect();
    throw err;
  }
}

export async function rconExec(cmd: string): Promise<string> {
  if (authenticated && client) return execNow(cmd);
  return new Promise((resolve, reject) => {
    commandQueue.push({ cmd, resolve, reject });
    if (!connecting) connect();
  });
}

export function rconConnect(): void {
  connect();
}
