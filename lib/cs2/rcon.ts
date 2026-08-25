import Rcon from "rcon-srcds";

/**
 * Singleton RCON client.
 *
 * Commands are strictly serialised. `rcon-srcds` shares one socket, does no
 * stream framing, and tags each request with a *random* packet id, so two
 * overlapping `execute()` calls can have their responses coalesced into a single
 * TCP segment and mis-attributed — in practice both promises then hang forever.
 * Serialising is therefore a correctness requirement, not an optimisation.
 *
 * Every command is also bounded by a timeout: a lost response would otherwise
 * wedge the queue permanently. A timeout tears the connection down, because at
 * that point the socket is out of sync with our expectations.
 */

const HOST = process.env.RCON_HOST ?? "cs2";
const PORT = parseInt(process.env.RCON_PORT ?? "27015", 10);
const PASSWORD = process.env.RCON_PASSWORD ?? "";
const AUTH_TIMEOUT_MS = 2000;
const COMMAND_TIMEOUT_MS = parseInt(process.env.RCON_COMMAND_TIMEOUT_MS ?? "5000", 10);
const CONNECT_WAIT_MS = parseInt(process.env.RCON_CONNECT_WAIT_MS ?? "5000", 10);
/** Bounds memory when CS2 is down: the status poll enqueues on every tick. */
const MAX_QUEUE = parseInt(process.env.RCON_MAX_QUEUE ?? "50", 10);
const MAX_BACKOFF_MS = 30_000;

/**
 * `backoff` means "a retry is scheduled but not yet running". Commands issued in
 * that window fail immediately instead of each burning a connect timeout — with
 * serialised execution, waiting would make a queue of N commands take N × the
 * timeout to drain.
 */
type ConnState = "disconnected" | "connecting" | "connected" | "backoff";

let client: Rcon | null = null;
let authenticated = false;
let state: ConnState = "disconnected";
let backoff = 1000;
let onFirstConnect: (() => void) | null = null;
let didFirstConnect = false;

/** Tail of the serialisation chain — one command in flight at a time. */
let chain: Promise<unknown> = Promise.resolve();
let queueDepth = 0;
let retryTimer: NodeJS.Timeout | null = null;

type Waiter = { resolve: () => void; reject: (e: unknown) => void };
let waiters: Waiter[] = [];

function settleWaiters(err?: unknown) {
  const pending = waiters;
  waiters = [];
  for (const w of pending) {
    if (err) w.reject(err);
    else w.resolve();
  }
}

async function connect(): Promise<void> {
  if (state === "connecting" || state === "backoff") return;
  state = "connecting";
  try {
    client = new Rcon({ host: HOST, port: PORT, timeout: AUTH_TIMEOUT_MS });
    await client.authenticate(PASSWORD);
    authenticated = true;
    backoff = 1000;
    state = "connected";
    console.log("[rcon] connected");
    settleWaiters();
    if (!didFirstConnect && onFirstConnect) {
      didFirstConnect = true;
      onFirstConnect();
    }
  } catch (err) {
    authenticated = false;
    client = null;
    state = "backoff";
    console.error(`[rcon] connect failed, retry in ${backoff}ms:`, err);
    // Fail anything waiting now rather than making it sit through the backoff;
    // the caller (a 2s poll tick) would rather fail fast and try again.
    settleWaiters(err);
    const delay = backoff;
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    // unref: the retry loop is endless by design, and it must not be the thing
    // keeping the process alive (it would stop `tsx` and the test runner from
    // ever exiting). The HTTP server holds the event loop open in production.
    retryTimer = setTimeout(() => {
      state = "disconnected";
      void connect();
    }, delay);
    retryTimer.unref();
  }
}

/** Drops the current connection and schedules a reconnect. */
function teardown() {
  authenticated = false;
  const dead = client;
  client = null;
  if (state === "connected") state = "disconnected";
  if (dead) {
    try {
      void dead.disconnect().catch(() => {});
    } catch {
      /* already gone */
    }
  }
  void connect();
}

function ensureConnected(): Promise<void> {
  if (state === "connected" && authenticated && client) return Promise.resolve();
  // A retry is pending: fail now so the queue drains instead of every command
  // burning a full connect timeout in turn.
  if (state === "backoff") {
    return Promise.reject(new Error("RCON unavailable (reconnecting)"));
  }
  void connect();
  return new Promise<void>((resolve, reject) => {
    const waiter: Waiter = { resolve, reject };
    waiters.push(waiter);
    setTimeout(() => {
      const i = waiters.indexOf(waiter);
      if (i >= 0) {
        waiters.splice(i, 1);
        reject(new Error("RCON not connected"));
      }
    }, CONNECT_WAIT_MS);
  });
}

async function execNow(cmd: string): Promise<string> {
  if (!client || !authenticated) throw new Error("RCON not connected");
  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await Promise.race([
      client.execute(cmd),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`RCON command timed out: ${cmd}`)),
          COMMAND_TIMEOUT_MS,
        );
      }),
    ]);
    return typeof result === "string" ? result : String(result);
  } catch (err) {
    // Either the socket errored or a response went missing; in both cases the
    // connection can no longer be trusted to be in sync.
    teardown();
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Runs a command on the CS2 server. Calls are queued and executed one at a time,
 * so callers may fire several concurrently without corrupting the socket.
 */
export function rconExec(cmd: string): Promise<string> {
  if (queueDepth >= MAX_QUEUE) {
    return Promise.reject(
      new Error(`RCON queue full (${MAX_QUEUE}); dropping: ${cmd}`),
    );
  }
  queueDepth += 1;

  const run = chain
    // Run regardless of whether the previous command succeeded — one failure
    // must not poison every subsequent command.
    .then(
      () => ensureConnected().then(() => execNow(cmd)),
      () => ensureConnected().then(() => execNow(cmd)),
    )
    .finally(() => {
      queueDepth -= 1;
    });

  // Keep the chain alive even when this command rejects.
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function rconConnect(onConnect?: () => void): void {
  if (onConnect) onFirstConnect = onConnect;
  void connect();
}

/** Test hook: current number of queued/in-flight commands. */
export function rconQueueDepth(): number {
  return queueDepth;
}

/** Closes the connection and cancels the reconnect loop (graceful shutdown). */
export function rconDisconnect(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const dead = client;
  client = null;
  authenticated = false;
  state = "disconnected";
  settleWaiters(new Error("RCON shutting down"));
  if (dead) {
    try {
      void dead.disconnect().catch(() => {});
    } catch {
      /* already gone */
    }
  }
}
