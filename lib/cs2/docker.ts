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
  } catch (err: any) {
    // 304 = already in desired state, 304/not modified is not an error for us
    if (err?.statusCode === 304) return;
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
}

export async function containerStats(name: string): Promise<ContainerStats> {
  assertAllowed(name);
  const c = docker.getContainer(name);
  const raw = (await c.stats({ stream: false })) as any;

  const cpuDelta =
    raw.cpu_stats.cpu_usage.total_usage -
    raw.precpu_stats.cpu_usage.total_usage;
  const systemDelta =
    raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;
  const numCpus = raw.cpu_stats.online_cpus ?? 1;
  const cpuPct =
    systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

  const rss = raw.memory_stats.usage ?? 0;
  const cache = raw.memory_stats.stats?.cache ?? 0;
  const memMb = (rss - cache) / 1024 / 1024;

  return { cpuPct: Math.round(cpuPct * 10) / 10, memMb: Math.round(memMb) };
}

export async function containerLogs(
  name: string,
  tail = 100,
): Promise<string> {
  assertAllowed(name);
  const c = docker.getContainer(name);
  const buf = await c.logs({ stdout: true, stderr: true, tail });
  return buf.toString("utf8");
}
