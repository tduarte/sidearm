"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUUpLeft, ClockCounterClockwise } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DangerConfirm } from "@/components/danger-confirm";
import { api } from "@/lib/api/client";
import { useMatchState } from "@/lib/hooks/use-match-state";
import type { RoundBackup } from "@/lib/cs2/round-backups";

function ago(iso: string): string {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 90) return `${Math.round(secs)}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  return `${Math.round(secs / 3600)}h ago`;
}

/**
 * Putting a broken match back.
 *
 * MatchZy saves a backup at the start of every round and restores one with
 * `css_restore <round>`. Both halves existed already and neither was reachable
 * from here, so recovering a match meant an RCON console and guessing which
 * round number to name.
 *
 * Only the current match's backups are offered. The directory keeps every
 * match the server has ever run, and "restore" pointed at last week's match is
 * not a recovery, it is a second accident.
 */
export function RoundBackups() {
  const qc = useQueryClient();
  const { data: match } = useMatchState();

  const backups = useQuery<RoundBackup[]>({
    queryKey: ["round-backups"],
    queryFn: () => api.getRoundBackups(),
    refetchInterval: 30_000,
  });

  const restore = useMutation({
    mutationFn: (round: number) => api.restoreRound(round),
    meta: { action: "Restoring the round" },
    onSuccess: (_r, round) => {
      toast.success(`Restoring round ${round}`, {
        description:
          "MatchZy reloads the round from its backup — score, sides and money go back with it.",
      });
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  /**
   * MatchZy tells us its own match id and map number, so ask it rather than
   * inferring. The inference was wrong in a way that would only show up
   * later: backups sort by match id numerically, and match ids come from the
   * panel's `match_number`, which is reused and not monotonic in time — load
   * match 1 today after running match 5 last week and "newest" is last week's.
   *
   * The fallback stays for a pug, where get5_status reports nothing and the
   * most recent files really are the best guess available.
   */
  const series = match?.series ?? null;
  const current = useMemo(() => {
    const all = backups.data ?? [];
    if (all.length === 0) return [];
    const matchId = series?.matchId ?? all[0].matchId;
    const mapNumber =
      series?.matchId != null ? series.mapNumber : all[0].mapNumber;
    return all.filter(
      (b) => b.matchId === matchId && b.mapNumber === mapNumber,
    );
  }, [backups.data, series]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClockCounterClockwise className="h-4 w-4" />
          Round backups
        </CardTitle>
        <CardDescription>
          MatchZy saves one at the start of every round. Restoring puts the
          match back to it — score, sides and money.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {backups.isPending ? (
          <Skeleton className="h-16" />
        ) : current.length === 0 ? (
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>No round backups yet.</p>
            <p className="text-xs">
              MatchZy writes these once a match is live. If one is running and
              this stays empty, the panel cannot see the game volume — check
              that the <code className="font-mono">cs2-data</code> mount is
              present on the panel service.
            </p>
          </div>
        ) : (
          <ul className="divide-y border">
            {current.map((b) => (
              <li
                key={b.fileName}
                className="flex flex-wrap items-center gap-3 px-3 py-2"
              >
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium tabular-nums">
                    Round {b.round}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {ago(b.savedAt)}
                  </span>
                </span>
                <DangerConfirm
                  title={`Restore round ${b.round}?`}
                  consequence="The match jumps back to the start of that round for everyone. Rounds played since are undone, and the score, sides and money go back with it."
                  operation={`css_restore ${b.round}`}
                  confirmLabel="Restore it"
                  onConfirm={() => restore.mutate(b.round)}
                >
                  {(arm) => (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={arm}
                      disabled={restore.isPending}
                    >
                      <ArrowUUpLeft className="h-4 w-4" />
                      Restore
                    </Button>
                  )}
                </DangerConfirm>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
