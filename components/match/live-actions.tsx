"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowCounterClockwise,
  ArrowsLeftRight,
  FlagCheckered,
  Pause,
  Play,
  Record,
  Stop,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DangerConfirm } from "@/components/danger-confirm";
import {
  MatchActionGrid,
  MatchActionTile,
} from "@/components/match/match-action-tile";
import { api } from "@/lib/api/client";
import { useMatchState } from "@/lib/hooks/use-match-state";
import { useServerStatus } from "@/lib/hooks/use-server-status";

/**
 * The mid-match reach: pause, resume, restart, and — depending on who owns the
 * match — demo control or the way out of a MatchZy match.
 *
 * `takeover` means MatchZy has a match loaded. It owns the map cycle, the
 * gameplay cvars and demo recording then (the server refuses `tv_record` from
 * the panel outright), so this card swaps the demo tiles for swap-sides and a
 * confirmed End match instead of offering buttons that cannot work.
 */
export function LiveActionsCard({ takeover }: { takeover: boolean }) {
  const qc = useQueryClient();
  const { data: match } = useMatchState();
  const { data: status } = useServerStatus();

  const pause = useMutation({
    mutationFn: (action: "pause" | "unpause") => api.setPause(action),
    meta: { action: "Pause" },
    onSuccess: (_r, action) => {
      toast(
        action === "pause" ? "Pause requested" : "Match resumed",
        action === "pause"
          ? { description: "CS2 applies it at the end of the current round." }
          : undefined,
      );
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const demo = useMutation({
    mutationFn: (action: "start" | "stop") => api.setDemo(action),
    meta: { action: "Demo recording" },
    onSuccess: (r, action) => {
      toast(
        action === "start" ? "Recording started" : "Recording stopped",
        r.demo.name ? { description: `${r.demo.name}.dem` } : undefined,
      );
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const swap = useMutation({
    mutationFn: () => api.swapTeams(),
    meta: { action: "Swapping sides" },
    onSuccess: () => {
      toast.success("Sides swapped");
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const restart = useMutation({
    mutationFn: () => api.rcon("mp_restartgame 1"),
    meta: { action: "Restarting the round" },
    onSuccess: () => toast("rcon: mp_restartgame 1"),
  });

  const end = useMutation({
    mutationFn: () => api.endMatch(),
    meta: { action: "Ending the match" },
    onSuccess: () => {
      toast.success("Match ended");
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  if (!match) return null;

  const recording = match.demo.state === "recording";
  // Demo recording runs through GOTV; without it `tv_record` fails, so the
  // tile says why rather than offering a button that cannot work.
  const gotvUp = !!status?.gotv;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Live actions</CardTitle>
      </CardHeader>
      <CardContent>
        <MatchActionGrid layout="actions">
          {/*
            Two tiles, not one toggle. CS2 exposes no pause state to read
            back, so a single button has to guess which way to go — and
            after a panel restart it guesses wrong.
          */}
          <MatchActionTile
            icon={Pause}
            label="Pause"
            description={
              takeover ? "css_forcepause · at freezetime" : "mp_pause_match · at round end"
            }
            variant={match.pause === "pause_requested" ? "default" : "outline"}
            disabled={pause.isPending}
            pending={pause.isPending}
            onClick={() => pause.mutate("pause")}
          />
          <MatchActionTile
            icon={Play}
            iconWeight="fill"
            label="Resume"
            description={takeover ? "css_forceunpause" : "mp_unpause_match"}
            variant="outline"
            disabled={pause.isPending}
            pending={pause.isPending}
            onClick={() => pause.mutate("unpause")}
          />
          <MatchActionTile
            icon={ArrowCounterClockwise}
            label="Restart round"
            description="mp_restartgame 1"
            variant="outline"
            disabled={restart.isPending}
            pending={restart.isPending}
            onClick={() => restart.mutate()}
          />
          {takeover ? (
            <>
              <MatchActionTile
                icon={ArrowsLeftRight}
                label="Swap sides"
                description="mp_swapteams"
                variant="outline"
                disabled={swap.isPending}
                pending={swap.isPending}
                onClick={() => swap.mutate()}
              />
              <DangerConfirm
                title="End the match?"
                consequence="MatchZy stops the match immediately and returns the server to warmup. The result is not recorded."
                operation="css_endmatch"
                confirmLabel="End it"
                onConfirm={() => end.mutate()}
              >
                {(arm) => (
                  <MatchActionTile
                    icon={FlagCheckered}
                    label="End match"
                    description="css_endmatch"
                    variant="destructive"
                    disabled={end.isPending}
                    pending={end.isPending}
                    onClick={arm}
                  />
                )}
              </DangerConfirm>
            </>
          ) : recording ? (
            <MatchActionTile
              icon={Stop}
              iconWeight="fill"
              label="Stop demo"
              description="tv_stoprecord"
              variant="destructive"
              disabled={demo.isPending || !gotvUp}
              pending={demo.isPending}
              onClick={() => demo.mutate("stop")}
            />
          ) : (
            <MatchActionTile
              icon={Record}
              label="Record demo"
              description={
                gotvUp
                  ? "tv_record"
                  : "needs GOTV — set TV_ENABLE=1 and recreate the container"
              }
              variant="outline"
              disabled={demo.isPending || !gotvUp}
              pending={demo.isPending}
              onClick={() => demo.mutate("start")}
            />
          )}
        </MatchActionGrid>
        {/*
          Under the tiles, not above them. This is the explanation you read
          once; the buttons are what you came for, and on a phone 160px of
          prose between the score and Pause is the whole first viewport.
        */}
        {takeover && (
          <CardDescription className="mt-4">
            MatchZy is running this match, so it owns the map cycle, the
            gameplay cvars and demo recording — it saves its own demo of every
            map. The panel&apos;s setup form and match tools stand down until it
            finishes.
          </CardDescription>
        )}
      </CardContent>
    </Card>
  );
}
