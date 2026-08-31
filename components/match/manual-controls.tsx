"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowCounterClockwise,
  ArrowsLeftRight,
  Flag,
  Knife,
  Play,
  Timer,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  MatchActionGrid,
  MatchActionTile,
} from "@/components/match/match-action-tile";
import { api } from "@/lib/api/client";
import { useMatchState } from "@/lib/hooks/use-match-state";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import type { MatchPhase } from "@/lib/api/types";

const PHASES: {
  value: MatchPhase;
  label: string;
  icon: Icon;
  iconWeight?: "fill" | "regular";
}[] = [
  // Only phases the server can actually report. Knife and Halftime used to sit
  // here and sent no RCON at all while reporting success; both are now explicit
  // actions below, labelled for what they really do.
  { value: "warmup", label: "Warmup", icon: Timer },
  { value: "live", label: "Live", icon: Play, iconWeight: "fill" },
  { value: "ended", label: "End match", icon: Flag },
];

/**
 * The plugin-less way to run a match: phase changes and cvar approximations of
 * a knife round. On a server without MatchZy this is the whole story; with the
 * plugin these are the fallback the panel keeps out of its way.
 */
export function ManualControls() {
  const qc = useQueryClient();
  const { data: match } = useMatchState();
  const { data: status } = useServerStatus();

  const setPhase = useMutation({
    mutationFn: (phase: MatchPhase) => api.setMatchPhase(phase),
    meta: { action: "Phase change" },
    onSuccess: (_, phase) => {
      toast.success(`Phase: ${phase}`);
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const knife = useMutation({
    mutationFn: (action: "setup" | "restore") => api.knife(action),
    meta: { action: "Knife round" },
    onSuccess: (_r, action) => {
      toast.success(
        action === "setup" ? "Knife round set up" : "Gameplay cvars restored",
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

  if (!match) return null;

  // MatchZy runs a real knife round and rewrites the same loadout cvars the
  // panel's approximation does. Leaving both live means two things fighting
  // over one setting, so when the plugin is there, ours stands down.
  const matchzyUp = status?.plugins?.matchzy === true;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Phase</CardTitle>
        </CardHeader>
        <CardContent>
          <MatchActionGrid layout="phase">
            {PHASES.map((p) => {
              const isCurrent = match.phase === p.value;
              const Icon = p.icon;
              return (
                <MatchActionTile
                  key={p.value}
                  icon={Icon}
                  iconWeight={p.iconWeight}
                  label={p.label}
                  variant={isCurrent ? "active" : "outline"}
                  pressed={isCurrent}
                  disabled={setPhase.isPending}
                  pending={setPhase.isPending}
                  onClick={() => setPhase.mutate(p.value)}
                />
              );
            })}
          </MatchActionGrid>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Round setup</CardTitle>
          <CardDescription>
            {matchzyUp ? (
              <>
                MatchZy is loaded and runs the knife round properly — including
                detecting who won and letting them pick sides. Start it in-game
                with <span className="font-mono">.knife</span>, or from the
                console with <span className="font-mono">css_start</span>. The
                panel&apos;s own cvar approximation is switched off here so the
                two do not fight over the same loadout settings.
              </>
            ) : (
              <>
                CS2 has no native knife round, and vanilla halftime happens on
                its own at <span className="font-mono">mp_maxrounds/2</span>.
                These are cvar approximations: the panel sets the loadout and
                swaps sides, but it cannot detect who won a knife round or run a
                match flow for you. That needs a plugin such as Get5 or MatchZy.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MatchActionGrid layout="actions">
            <MatchActionTile
              icon={Knife}
              label="Set up knife"
              description={
                matchzyUp
                  ? "MatchZy handles this — say .knife in chat"
                  : "knives only, no buy, restart"
              }
              variant={match.knifeSetupApplied ? "default" : "outline"}
              disabled={knife.isPending || match.knifeSetupApplied || matchzyUp}
              pending={knife.isPending}
              onClick={() => knife.mutate("setup")}
            />
            <MatchActionTile
              icon={ArrowCounterClockwise}
              label="Restore gameplay"
              description="puts back the values from before"
              variant="outline"
              // Deliberately NOT gated on MatchZy, unlike Set up knife. If
              // the panel applied a knife setup before the plugin arrived,
              // the baseline on disk is the only way back — disabling this
              // would strand the server with a knives-only loadout and no
              // undo. It is already inert unless the panel has something to
              // restore.
              disabled={knife.isPending || !match.knifeSetupApplied}
              pending={knife.isPending}
              onClick={() => knife.mutate("restore")}
            />
            <MatchActionTile
              icon={ArrowsLeftRight}
              label="Swap sides"
              description="mp_swapteams"
              variant="outline"
              disabled={swap.isPending}
              pending={swap.isPending}
              onClick={() => swap.mutate()}
            />
          </MatchActionGrid>
        </CardContent>
      </Card>
    </div>
  );
}
