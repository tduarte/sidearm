"use client";

/**
 * Start, stop, restart, and applying a pending CS2 update.
 *
 * These lived in the old top bar. The Broadcast shell has no top bar, but they
 * are still whole-server operations and they still belong beside the thing that
 * reports the server's condition — so they sit in the rail, next to the bus,
 * and nowhere else.
 *
 * Every one of them goes through the Docker API. With the socket proxy down
 * they used to look enabled and do nothing at all; here they say why instead.
 *
 * The confirms are still `DangerConfirm` — shadcn dialogs rendered in a portal
 * outside `.bc`, so they do not yet wear this world. That is deliberate for
 * now: the arm-then-fire discipline and the blast-radius copy are the parts
 * that matter, and duplicating them to restyle them would be the wrong trade.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowsClockwise, CloudArrowDown, Play, Stop } from "@phosphor-icons/react";
import { DangerConfirm } from "@/components/danger-confirm";
import { useCan } from "@/components/session-provider";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import { useUpdateStatus } from "@/lib/hooks/use-update-status";
import { api } from "@/lib/api/client";

const DOCKER_DOWN =
  "The Docker socket proxy is unreachable, so the panel cannot control the container. RCON, chat and the console still work.";

export function Lifecycle() {
  const { data: status } = useServerStatus();
  const { data: update } = useUpdateStatus();
  const canControl = useCan("admin");
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

  if (!canControl || !status) return null;

  const dockerDown = !status.control.docker;
  const updating = status.state === "updating";
  // Only offer the button when the panel actually knows an update is pending
  // and the server is idle enough to be worth interrupting.
  const updateAvailable =
    update?.upToDate === false && status.state === "running";

  return (
    <span className="bc__life">
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
            <button
              type="button"
              className="bc__railBtn bc__railBtn--info"
              onClick={arm}
              disabled={applyUpdate.isPending}
            >
              <CloudArrowDown size={13} weight="bold" aria-hidden />
              Update
            </button>
          )}
        </DangerConfirm>
      )}

      {status.state === "running" ? (
        <>
          <DangerConfirm
            title="Restart the server?"
            // Restarting *is* the update on this image, so when one is pending
            // the honest cost is tens of GB and an hour or more.
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
              <button
                type="button"
                className="bc__railBtn"
                onClick={arm}
                disabled={restart.isPending || dockerDown}
                title={dockerDown ? DOCKER_DOWN : "Restart the container"}
              >
                <ArrowsClockwise size={13} weight="bold" aria-hidden />
                Restart
              </button>
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
              <button
                type="button"
                className="bc__railBtn bc__railBtn--danger"
                onClick={arm}
                disabled={toggle.isPending || dockerDown}
                title={dockerDown ? DOCKER_DOWN : "Stop the container"}
              >
                <Stop size={13} weight="fill" aria-hidden />
                Stop
              </button>
            )}
          </DangerConfirm>
        </>
      ) : (
        <button
          type="button"
          className="bc__railBtn"
          onClick={() => toggle.mutate("running")}
          disabled={
            toggle.isPending ||
            dockerDown ||
            status.state === "starting" ||
            // Interrupting steamcmd mid-download just restarts the download;
            // there is nothing useful to do but wait.
            updating
          }
          title={dockerDown ? DOCKER_DOWN : "Start the container"}
        >
          <Play size={13} weight="fill" aria-hidden />
          Start
        </button>
      )}
    </span>
  );
}
