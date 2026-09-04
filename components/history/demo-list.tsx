"use client";

import { useQuery } from "@tanstack/react-query";
import { DownloadSimple, FilmSlate } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import type { DemoFile } from "@/lib/cs2/demos";

function mb(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/**
 * Demos you can actually retrieve.
 *
 * `tv_record` writes into the CS2 volume, which the panel could not see — so
 * recording a demo produced a file with no way to get at it. The panel now
 * mounts that volume read-only and serves the files.
 *
 * It lives under History because that is what a demo is: the recording of a
 * match that already happened, next to the score and the rounds of the same
 * match. Starting and stopping one is a live decision and stayed on the
 * dashboard, in the dock beside pause and knife.
 */
export function DemoList() {
  const demos = useQuery<DemoFile[]>({
    queryKey: ["demos"],
    queryFn: () => api.getDemos(),
    refetchInterval: 30_000,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FilmSlate className="h-4 w-4" />
          Demos
        </CardTitle>
        <CardDescription>
          Recorded by GOTV into the game volume, newest first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {demos.isPending ? (
          <Skeleton className="h-16" />
        ) : (demos.data?.length ?? 0) === 0 ? (
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>No demos recorded yet.</p>
            <p className="text-xs">
              Start one from{" "}
              <span className="font-medium text-foreground">Record demo</span> in
              the dashboard dock. If you have recorded one and it is not here,
              the panel cannot see the game volume — check that the{" "}
              <code className="font-mono">cs2-data</code> mount is present on
              the panel service.
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {demos.data?.map((d) => (
              <li
                key={d.name}
                className="flex flex-wrap items-center gap-3 border px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  {d.name}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {mb(d.sizeBytes)} ·{" "}
                  {new Date(d.modifiedAt).toLocaleString()}
                </span>
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={`/api/demos/${encodeURIComponent(d.name)}`}
                    download={d.name}
                  >
                    <DownloadSimple className="h-4 w-4" />
                    Download
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
