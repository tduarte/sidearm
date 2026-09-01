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
import { formatEta, gb } from "@/components/update-progress-card";
import { DangerConfirm } from "@/components/danger-confirm";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import { useUpdateStatus } from "@/lib/hooks/use-update-status";
import { api } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  describePendingOp,
  formatElapsed,
  usePendingOp,
} from "@/lib/hooks/use-pending-op";

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

  const { op: pendingOp, elapsedSec } = usePendingOp();
  const updating = status?.state === "updating";
  const progress = status?.updateProgress ?? null;
  /**
   * Every lifecycle control goes through the Docker API. With the socket proxy
   * down they used to look enabled and do nothing at all — say so instead.
   */
  const dockerDown = status ? !status.control.docker : false;
  // Anything but a map change belongs in the header: those are whole-server
  // operations, and the map page owns its own tile-level pending state.
  const lifecyclePending =
    pendingOp && pendingOp.kind !== "map" ? pendingOp : null;
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

          {lifecyclePending && (
            <span
              className="hidden items-center gap-1.5 text-xs text-muted-foreground tabular-nums sm:inline-flex"
              title={describePendingOp(lifecyclePending).detail}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              {describePendingOp(lifecyclePending).label} ·{" "}
              {formatElapsed(elapsedSec)}
            </span>
          )}

          {updating ? (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Progress
                value={progress?.pct ?? 0}
                className="h-1.5 w-24 shrink-0 sm:w-40"
              />
              <span className="hidden truncate text-xs text-muted-foreground tabular-nums sm:inline">
                {progress
                  ? [
                      `${progress.phase} · ${gb(progress.bytesDone)} / ${gb(progress.bytesTotal)}`,
                      formatEta(progress.etaSec),
                    ]
                      .filter(Boolean)
                      .join(" · ")
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

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {updateAvailable && (
              <DangerConfirm
                title="Apply the CS2 update now?"
                consequence="Applying the update restarts the container, so everyone connected is dropped. The server downloads the new build on boot, which can take a while."
                operation={
                  update?.requiredVersion
                    ? `docker restart cs2 · build ${update.installedVersion} → ${update.requiredVersion}`
                    : "docker restart cs2"
                }
                confirmLabel="Restart and update"
                onConfirm={() => applyUpdate.mutate()}
              >
                {(arm) => (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-sky-500/30 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 hover:text-sky-300"
                    onClick={arm}
                    disabled={applyUpdate.isPending}
                    aria-label="Update available"
                  >
                    <CloudArrowDown className="h-4 w-4" />
                    <span className="hidden sm:inline">Update available</span>
                  </Button>
                )}
              </DangerConfirm>
            )}
            {status.state === "running" ? (
              <>
                <DangerConfirm
                  title="Restart the server?"
                  // Restarting *is* the update on this image, so when one is
                  // pending the honest cost is tens of GB and an hour or more,
                  // not "under a minute". The panel already knows which it is.
                  consequence={
                    updateAvailable
                      ? "A CS2 update is pending, so this restart will also apply it: the container re-downloads game files on boot, which can take an hour or more. Everyone connected is dropped and the server stays unjoinable until it finishes."
                      : "Everyone connected is dropped while the container comes back. It usually takes under a minute unless a game update is pending."
                  }
                  operation="docker restart cs2"
                  confirmLabel="Restart"
                  onConfirm={() => restart.mutate()}
                >
                  {(arm) => (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={arm}
                      disabled={restart.isPending || dockerDown}
                      title={dockerDown ? dockerReason : undefined}
                      aria-label="Restart the server"
                    >
                      <ArrowsClockwise className="h-4 w-4" />
                      <span className="hidden sm:inline">Restart</span>
                    </Button>
                  )}
                </DangerConfirm>
                <DangerConfirm
                  title="Stop the server?"
                  consequence="Everyone connected is dropped and the server goes offline until you start it again."
                  operation="docker stop cs2"
                  confirmLabel="Stop server"
                  onConfirm={() => toggle.mutate("stopped")}
                >
                  {(arm) => (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={arm}
                      disabled={toggle.isPending || dockerDown}
                      title={dockerDown ? dockerReason : undefined}
                      aria-label="Stop the server"
                    >
                      <Stop className="h-4 w-4" weight="fill" />
                      <span className="hidden sm:inline">Stop</span>
                    </Button>
                  )}
                </DangerConfirm>
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
                aria-label="Start the server"
              >
                <Play className="h-4 w-4" weight="fill" />
                <span className="hidden sm:inline">Start</span>
              </Button>
            )}
          </div>
        </>
      )}
    </header>
  );
}
