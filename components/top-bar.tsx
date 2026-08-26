"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowsClockwise,
  CloudArrowDown,
  Play,
  Stop,
  UsersThree,
  MapPin,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { StatusPill } from "@/components/status-pill";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import { useUpdateStatus } from "@/lib/hooks/use-update-status";
import { api } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";

/** Bytes → GB with one decimal. steamcmd totals are always in the tens of GB. */
function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function TopBar() {
  const { data: status, isPending } = useServerStatus();
  const { data: update } = useUpdateStatus();
  const qc = useQueryClient();

  // `meta.action` names the action in the global failure toast
  // (components/providers.tsx). Every mutation carries one.
  const restart = useMutation({
    mutationFn: () => api.restart(),
    meta: { action: "Restart" },
    onSuccess: () => {
      toast.success("Server restarting");
      qc.invalidateQueries({ queryKey: ["status"] });
    },
  });

  const toggle = useMutation({
    mutationFn: (next: "running" | "stopped") => api.setServerState(next),
    meta: { action: "Start/stop" },
    onSuccess: (_data, next) => {
      toast.success(next === "running" ? "Server starting" : "Server stopping");
      qc.invalidateQueries({ queryKey: ["status"] });
    },
  });

  const applyUpdate = useMutation({
    mutationFn: () => api.applyUpdate(),
    meta: { action: "Applying the update" },
    onSuccess: () => {
      toast.success("Restarting to apply the CS2 update", {
        description: "Game files download on boot; this takes a while.",
      });
      qc.invalidateQueries({ queryKey: ["status"] });
    },
  });

  const updating = status?.state === "updating";
  const progress = status?.updateProgress ?? null;
  /**
   * Every lifecycle control goes through the Docker API. With the socket proxy
   * down they used to look enabled and do nothing at all — say so instead.
   */
  const dockerDown = status ? !status.control.docker : false;
  const dockerReason =
    "The Docker socket proxy is unreachable, so the panel cannot control the container. RCON, chat and the console still work.";
  // Only offer the button when we actually know an update is pending and the
  // server is idle enough to be worth interrupting.
  const updateAvailable =
    update?.upToDate === false && status?.state === "running";

  return (
    <header className="flex h-14 items-center gap-3 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 self-stretch" />
      {isPending || !status ? (
        <Skeleton className="h-6 w-24" />
      ) : (
        <>
          <StatusPill state={status.state} pct={progress?.pct} />

          {updating ? (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Progress
                value={progress?.pct ?? 0}
                className="h-1.5 w-24 shrink-0 sm:w-40"
              />
              <span className="hidden truncate text-xs text-muted-foreground tabular-nums sm:inline">
                {progress
                  ? `${progress.phase} · ${gb(progress.bytesDone)} / ${gb(progress.bytesTotal)}`
                  : "starting up"}
              </span>
            </div>
          ) : (
            <div className="hidden min-w-0 items-center gap-3 text-sm text-muted-foreground sm:flex">
              <span className="inline-flex min-w-0 max-w-[min(40vw,20rem)] items-center gap-2">
                <span
                  className="truncate font-medium text-foreground"
                  title={status.hostname}
                >
                  {status.hostname}
                </span>
                <span className="shrink-0 text-muted-foreground/70" aria-hidden>
                  ·
                </span>
                <span className="inline-flex min-w-0 shrink items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate font-mono text-xs">{status.map}</span>
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <UsersThree className="h-3.5 w-3.5" />
                {status.players}/{status.maxPlayers ?? "?"}
              </span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {updateAvailable && (
              <Button
                size="sm"
                variant="outline"
                className="border-sky-500/30 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 hover:text-sky-300"
                onClick={() => applyUpdate.mutate()}
                disabled={applyUpdate.isPending}
                title={
                  update?.requiredVersion
                    ? `Build ${update.installedVersion} → ${update.requiredVersion}. Restarts the server.`
                    : "Restarts the server to download the update."
                }
              >
                <CloudArrowDown className="h-4 w-4" />
                Update available
              </Button>
            )}
            {status.state === "running" ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => restart.mutate()}
                  disabled={restart.isPending || dockerDown}
                  title={dockerDown ? dockerReason : undefined}
                >
                  <ArrowsClockwise className="h-4 w-4" />
                  Restart
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => toggle.mutate("stopped")}
                  disabled={toggle.isPending || dockerDown}
                  title={dockerDown ? dockerReason : undefined}
                >
                  <Stop className="h-4 w-4" weight="fill" />
                  Stop
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => toggle.mutate("running")}
                disabled={
                  toggle.isPending ||
                  dockerDown ||
                  status.state === "starting" ||
                  // Interrupting steamcmd mid-download just restarts the
                  // download; there is nothing useful to do but wait.
                  updating
                }
                title={dockerDown ? dockerReason : undefined}
              >
                <Play className="h-4 w-4" weight="fill" />
                Start
              </Button>
            )}
          </div>
        </>
      )}
    </header>
  );
}
