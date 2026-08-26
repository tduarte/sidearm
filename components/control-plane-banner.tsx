"use client";

import { PlugsConnected, Terminal } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useServerStatus } from "@/lib/hooks/use-server-status";

/**
 * Says which half of the panel is broken, when half of it is.
 *
 * The panel drives the server through two independent channels, and losing
 * either leaves a convincing-looking panel where a subset of the controls
 * silently do nothing:
 *
 *  - no Docker API  → Start / Stop / Restart, the update flow and the CPU and
 *    memory tiles are dead; RCON, chat and the console are fine.
 *  - no RCON        → the roster, map changes and every match control are
 *    dead; the container can still be restarted.
 *
 * `AGENTS.md` calls the first one out by name as "a confusing half-broken
 * panel rather than an obvious one". This is the fix for that.
 */
export function ControlPlaneBanner() {
  const { data: status } = useServerStatus();
  if (!status) return null;

  const { docker, rcon } = status.control;
  if (docker && rcon) return null;

  // While the container is genuinely stopped or still pulling game files, RCON
  // is *expected* to be silent. Saying "RCON is not answering" there would be
  // alarming and wrong — the status pill already tells that story properly.
  const rconSilenceIsExpected =
    status.state === "stopped" ||
    status.state === "starting" ||
    status.state === "updating" ||
    status.state === "stopping";

  const showRcon = !rcon && !rconSilenceIsExpected;
  if (docker && !showRcon) return null;

  return (
    <div className="space-y-2 border-b bg-background px-4 py-2 md:px-6">
      {!docker && (
        <Alert variant="destructive">
          <PlugsConnected />
          <AlertTitle>Docker control is unavailable</AlertTitle>
          <AlertDescription>
            The panel cannot reach the Docker socket proxy, so Start, Stop,
            Restart, applying a CS2 update, and the CPU and memory readings are
            all out of action. RCON, chat and the console are unaffected. Check
            that the <code className="font-mono">docker-proxy</code> service is
            running.
          </AlertDescription>
        </Alert>
      )}
      {showRcon && (
        <Alert variant="destructive">
          <Terminal />
          <AlertTitle>RCON is not answering</AlertTitle>
          <AlertDescription>
            The container is up but the game server is not responding, so the
            roster, map changes and every match control are unavailable. If the
            server was just restarted this clears on its own; if it persists,
            the console and container logs are the place to look.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
