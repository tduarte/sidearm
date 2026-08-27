"use client";

import { CloudArrowDown, Info } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ServerStatus } from "@/lib/api/types";

/** Bytes → GB with one decimal. steamcmd totals are in the tens of GB. */
function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/**
 * The screen for a server that is downloading itself.
 *
 * A first boot pulls 40–70 GB and takes hours, during which RCON is silent —
 * so the dashboard rendered an `unknown` map and `0` players as though that
 * were the steady state. For someone who has just run `docker compose up` for
 * the first time, that reads as broken.
 *
 * Shown instead of the normal dashboard while the server has never been
 * reachable, and only then: once RCON has answered, a later download is an
 * update rather than a first run, and the top bar already narrates that.
 */
export function FirstRun({ status }: { status: ServerStatus }) {
  const progress = status.updateProgress ?? null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CloudArrowDown className="h-5 w-5" />
            Downloading Counter-Strike 2
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The game files are about 40–70 GB and download on first boot. This
            takes a while — an hour or two on a fast connection. Nothing is
            wrong; the server simply is not listening yet.
          </p>

          {progress ? (
            <div className="space-y-2">
              <Progress value={progress.pct} className="h-2" />
              <p className="text-sm tabular-nums text-muted-foreground">
                {progress.phase} · {gb(progress.bytesDone)} of{" "}
                {gb(progress.bytesTotal)} · {Math.floor(progress.pct)}%
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Waiting for steamcmd to report progress. If nothing appears for
              several minutes, <code className="font-mono">docker compose logs -f cs2</code>{" "}
              shows what it is doing.
            </p>
          )}
        </CardContent>
      </Card>

      <Alert>
        <Info />
        <AlertTitle>What you can do meanwhile</AlertTitle>
        <AlertDescription>
          <p>
            The panel works now — Config, Maps and Settings are all usable, and
            anything you set is applied once the server comes up. The console is
            live if you want to watch the download.
          </p>
          <p>
            Players cannot connect until this finishes. The status pill in the
            header turns green when the server starts answering.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}

/**
 * Whether this is a first run rather than a routine restart.
 *
 * The distinction that matters is whether RCON has EVER answered: a server
 * mid-update has a map and a build from before, while one that has never been
 * up has neither.
 */
export function isFirstRun(status: ServerStatus): boolean {
  if (status.control.rcon) return false;
  if (status.state !== "starting" && status.state !== "updating") return false;
  return status.build === null && status.map === "unknown";
}
