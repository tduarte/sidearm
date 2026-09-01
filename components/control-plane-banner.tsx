"use client";

import Link from "next/link";
import {
  Plugs,
  PlugsConnected,
  ShieldWarning,
  Terminal,
} from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCan } from "@/components/session-provider";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import { describePluginFailure } from "@/lib/cs2/plugins";
import type { ServerStatus } from "@/lib/api/types";

/**
 * Whether the server is running without VAC — the dead-GSLT signature.
 *
 * `vacSecure` is `null` until RCON has read a `version :` line, and a server
 * that is stopped or still booting has not got there yet, so only a *running*
 * `false` means anything. Steam quietly reclaims tokens that go unused, which
 * makes this something a working server turns into on its own, weeks after
 * anyone touched the configuration.
 */
export function isUnprotected(status: ServerStatus): boolean {
  return status.vacSecure === false && status.state === "running";
}

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
 *  - no GSLT        → the server runs, but unlisted and with VAC off, which
 *    is a thing Steam does to it rather than a thing anyone changed.
 *  - no MatchZy     → only on a server that HAD it: a CS2 update rewrote
 *    `gameinfo.gi` and the plugins quietly stopped loading. Everything works;
 *    match control is just back to the panel's cvar approximation.
 *
 * `AGENTS.md` calls the first one out by name as "a confusing half-broken
 * panel rather than an obvious one". This is the fix for that.
 */
export function ControlPlaneBanner() {
  const { data: status } = useServerStatus();
  const canReadConsole = useCan("moderator");
  if (!status) return null;

  const { docker, rcon } = status.control;

  // Silent unless MatchZy was there and has since gone — most installs run
  // without plugins on purpose and must never see this.
  const pluginFailure = status.plugins
    ? describePluginFailure(status.plugins, status.plugins.regressed)
    : null;

  // While the container is genuinely stopped or still pulling game files, RCON
  // is *expected* to be silent. Saying "RCON is not answering" there would be
  // alarming and wrong — the status pill already tells that story properly.
  const rconSilenceIsExpected =
    status.state === "stopped" ||
    status.state === "starting" ||
    status.state === "updating" ||
    status.state === "stopping";

  const showRcon = !rcon && !rconSilenceIsExpected;
  const showVac = isUnprotected(status);
  if (docker && !showRcon && !pluginFailure && !showVac) return null;

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
            server was just restarted this clears on its own; if it persists,{" "}
            {/*
              The banner names the console as the place to look and, until now,
              made you find it yourself. Moderators and up only — a viewer
              cannot open the console.
            */}
            {canReadConsole ? (
              <Link href="/console" className="font-medium underline">
                the console
              </Link>
            ) : (
              "the console"
            )}{" "}
            and the container logs are the place to look.
          </AlertDescription>
        </Alert>
      )}
      {showVac && (
        <Alert>
          <ShieldWarning />
          <AlertTitle>The server is running without VAC</AlertTitle>
          <AlertDescription className="space-y-1">
            <span>
              It is unlisted in the server browser and anti-cheat is off, though
              anyone with the connect string can still join. This is what a dead
              or missing GSLT looks like — the container log repeats{" "}
              <code className="font-mono">
                Cert request for invalid failed with reason code 5005
              </code>
              . Steam reclaims tokens that go unused, so a server that was fine
              for months can arrive here on its own.
            </span>
            <span className="text-muted-foreground">
              Issue a new token at steamcommunity.com/dev/managegameservers, put
              it in <code className="font-mono">GSLT</code> and run{" "}
              <code className="font-mono">
                docker compose up -d --force-recreate cs2
              </code>
              . It is a launch argument, so a restart will not pick it up — and
              recreating the container drops everyone connected.
            </span>
          </AlertDescription>
        </Alert>
      )}
      {pluginFailure && (
        <Alert>
          <Plugs />
          <AlertTitle>{pluginFailure.title}</AlertTitle>
          <AlertDescription className="space-y-1">
            <span>{pluginFailure.detail}</span>
            <span className="text-muted-foreground">
              {pluginFailure.likelyCause}
            </span>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
