import Docker from "dockerode";

const ALLOWLIST = ["cs2"];

const docker = new Docker({
  host: process.env.DOCKER_HOST_ADDR ?? "docker-proxy",
  port: parseInt(process.env.DOCKER_PORT ?? "2375", 10),
  protocol: "http",
});

function assertAllowed(name: string) {
  if (!ALLOWLIST.includes(name)) {
    throw new Error(`Container "${name}" is not in the allowlist`);
  }
}

function statusCodeOf(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "statusCode" in err) {
    const code = (err as { statusCode?: unknown }).statusCode;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

export async function containerAction(
  name: string,
  action: "start" | "stop" | "restart",
): Promise<void> {
  assertAllowed(name);
  const c = docker.getContainer(name);
  try {
    if (action === "start") await c.start();
    else if (action === "stop") await c.stop();
    else await c.restart();
  } catch (err: unknown) {
    // 304 = already in the desired state, which is not an error for us.
    if (statusCodeOf(err) === 304) return;
    throw err;
  }
}

export async function inspectContainer(name: string) {
  assertAllowed(name);
  return docker.getContainer(name).inspect();
}

export interface ContainerStats {
  cpuPct: number;
  memMb: number;
  memLimitMb: number;
}

/** The subset of Docker's stats payload we actually read. */
interface RawStats {
  cpu_stats?: {
    cpu_usage?: { total_usage?: number };
    system_cpu_usage?: number;
    online_cpus?: number;
  };
  precpu_stats?: {
    cpu_usage?: { total_usage?: number };
    system_cpu_usage?: number;
  };
  memory_stats?: {
    usage?: number;
    limit?: number;
    stats?: Record<string, number>;
  };
}

export async function containerStats(name: string): Promise<ContainerStats> {
  assertAllowed(name);
  const c = docker.getContainer(name);
  const raw = (await c.stats({ stream: false })) as RawStats;

  const cpuDelta =
    (raw.cpu_stats?.cpu_usage?.total_usage ?? 0) -
    (raw.precpu_stats?.cpu_usage?.total_usage ?? 0);
  const systemDelta =
    (raw.cpu_stats?.system_cpu_usage ?? 0) -
    (raw.precpu_stats?.system_cpu_usage ?? 0);
  const numCpus = raw.cpu_stats?.online_cpus ?? 1;
  const cpuPct = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

  // `memory_stats.usage` counts the page cache, which makes a CS2 container
  // reading 40 GB of game files look permanently near its limit. Docker's own
  // `docker stats` subtracts the inactive file cache — the field name differs
  // between cgroup versions:
  //   cgroup v2: inactive_file
  //   cgroup v1: total_inactive_file (older daemons expose `cache`)
  // The previous code only read `cache`, so on any cgroup v2 host (i.e. every
  // current Linux distro) the subtraction silently became zero.
  const memStats = raw.memory_stats?.stats ?? {};
  const inactiveFile =
    memStats.inactive_file ?? memStats.total_inactive_file ?? memStats.cache ?? 0;
  const usage = raw.memory_stats?.usage ?? 0;
  const memMb = Math.max(0, usage - inactiveFile) / 1024 / 1024;
  const memLimitMb = (raw.memory_stats?.limit ?? 0) / 1024 / 1024;

  return {
    cpuPct: Math.round(cpuPct * 10) / 10,
    memMb: Math.round(memMb),
    memLimitMb: Math.round(memLimitMb),
  };
}

/**
 * Strips Docker's stream multiplexing headers.
 *
 * A container started without a TTY has its logs framed as
 * `[stream:u8][000][length:u32be][payload]` per chunk. Calling `toString()` on
 * the raw buffer leaves those 8 bytes of binary in the middle of the text.
 * Output from a TTY container is unframed, so fall back to returning it as-is.
 */
export function demuxDockerStream(buf: Buffer): string {
  const parts: string[] = [];
  let offset = 0;

  while (offset + 8 <= buf.length) {
    const streamType = buf[offset];
    // Frame headers always start with 0/1/2 followed by three zero bytes.
    const looksFramed =
      streamType <= 2 &&
      buf[offset + 1] === 0 &&
      buf[offset + 2] === 0 &&
      buf[offset + 3] === 0;
    if (!looksFramed) return buf.toString("utf8");

    const length = buf.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = Math.min(start + length, buf.length);
    parts.push(buf.toString("utf8", start, end));
    offset = end;
  }

  return parts.length > 0 ? parts.join("") : buf.toString("utf8");
}

export async function containerLogs(name: string, tail = 100): Promise<string> {
  assertAllowed(name);
  const c = docker.getContainer(name);
  const buf = await c.logs({ stdout: true, stderr: true, tail });
  return demuxDockerStream(buf as unknown as Buffer);
}
