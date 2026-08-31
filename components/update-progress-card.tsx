"use client";

import { CloudArrowDown } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { UpdateProgress } from "@/lib/api/types";

/** Bytes → GB with one decimal. steamcmd totals are always in the tens of GB. */
export function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** Bytes/sec → MB/s, or null when no rate has been established yet. */
export function formatRate(bytesPerSec: number | null | undefined): string | null {
  if (typeof bytesPerSec !== "number" || bytesPerSec <= 0) return null;
  return `${(bytesPerSec / 1024 ** 2).toFixed(1)} MB/s`;
}

/**
 * Seconds → a deliberately coarse "time left".
 *
 * Rounded to minutes and prefixed with "about" because the underlying rate
 * swings by a factor of two on a real download; a to-the-second countdown would
 * claim a precision this cannot support.
 */
export function formatEta(sec: number | null | undefined): string | null {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 0) return null;
  if (sec < 60) return "less than a minute left";

  const mins = Math.round(sec / 60);
  if (mins < 60) return `about ${mins} min left`;

  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest === 0
    ? `about ${hours}h left`
    : `about ${hours}h ${rest}m left`;
}

/** The progress bar plus its numbers, shared by every surface that shows them. */
export function UpdateProgressDetail({
  progress,
}: {
  progress: UpdateProgress | null;
}) {
  if (!progress) {
    return (
      <p className="text-sm text-muted-foreground">
        Waiting for steamcmd to report progress. If nothing appears for several
        minutes, <code className="font-mono">docker compose logs -f cs2</code>{" "}
        shows what it is doing.
      </p>
    );
  }

  const rate = formatRate(progress.bytesPerSec);
  const eta = formatEta(progress.etaSec);

  return (
    <div className="space-y-2">
      <Progress value={progress.pct} className="h-2" />
      <p className="text-sm tabular-nums text-muted-foreground">
        {progress.phase} · {gb(progress.bytesDone)} of {gb(progress.bytesTotal)}{" "}
        · {Math.floor(progress.pct)}%
      </p>
      {/* Only once there is a real measurement — an ETA is the whole reason
          anyone opens this, so an invented one is worse than none. */}
      {(rate || eta) && (
        <p className="text-sm tabular-nums text-muted-foreground">
          {[rate, eta].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

/**
 * The dashboard's banner for a server that is fetching game files.
 *
 * Sits above the normal tiles rather than replacing them, because during an
 * update those tiles are the misleading part: the map is whatever was loaded
 * before the restart and the roster is empty, which reads as an idle server
 * rather than one that cannot be joined. This says which it is.
 */
export function UpdateProgressCard({
  progress,
}: {
  progress: UpdateProgress | null;
}) {
  const downloading = /download/i.test(progress?.phase ?? "");

  return (
    <Card className="border-sky-500/30 bg-sky-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CloudArrowDown className="h-5 w-5 text-sky-400" />
          {downloading
            ? "Downloading Counter-Strike 2"
            : "Updating Counter-Strike 2"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The server is fetching game files and is not listening yet, so nobody
          can connect until this finishes. The map and player count below are
          from before the restart.
        </p>
        <UpdateProgressDetail progress={progress} />
      </CardContent>
    </Card>
  );
}
