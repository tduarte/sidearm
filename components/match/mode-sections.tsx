"use client";

import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  CaretDown,
  ChartLine,
  Coffee,
  FastForward,
  Fire,
  GameController,
  Infinity as InfinityIcon,
  Package,
  PictureInPicture,
  Prohibit,
  Shield,
  ShoppingCart,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  MatchActionGrid,
  MatchActionTile,
} from "@/components/match/match-action-tile";
import { CvarTile } from "@/components/match/cvar-tile";
import { useCan } from "@/components/session-provider";
import { api } from "@/lib/api/client";
import { useCvarGroup } from "@/lib/hooks/use-cvar-group";
import { asBool } from "@/lib/cs2/cvars";
import { practiceSpec } from "@/lib/cs2/practice";
import { cn } from "@/lib/utils";
import type { CvarSpec } from "@/lib/api/types";

function SectionCard({
  id,
  title,
  description,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Card className={open ? undefined : "pb-0"}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 px-4 pb-4 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>
          <span className="block font-heading text-sm font-medium">
            {title}
          </span>
          <span className="mt-1 block text-xs/relaxed text-muted-foreground">
            {description}
          </span>
        </span>
        <CaretDown
          aria-hidden
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <CardContent id={id} className="space-y-5">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

/**
 * The other things this server can be tonight: casual/DM mode switches and the
 * practice suite. Folded so they never compete with the match flow above —
 * and because the practice cvars are only polled while their section is open
 * (RCON is one serialised socket; reading values nobody is looking at starves
 * the status poll).
 *
 * Two routes underneath, and they need different roles. The `CvarTile`s go
 * through `/api/match/cvars`, which a moderator may call; the tiles that send a
 * raw command go through `/api/rcon`, which is admin — "an arbitrary-command
 * escape hatch; it is not a moderator tool". They looked identical, so a
 * moderator got a grid where half the tiles worked and the other half returned
 * 403 with no way to tell which was which beforehand. The raw-command tiles are
 * now drawn only for an admin, and their absence is stated.
 */
export function ModeSections() {
  const [casualOpen, setCasualOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const cvars = useCvarGroup("practice", practiceOpen);
  const canRcon = useCan("admin");

  const rcon = useMutation({
    mutationFn: (cmd: string) => api.rcon(cmd),
    meta: { action: "Command" },
    onSuccess: (_, cmd) => toast(`rcon: ${cmd}`),
  });

  // Read back from the server, not remembered. A local boolean resets on every
  // reload and re-locks the dependent tiles even when the server still has
  // cheats on.
  const cheatsOn = asBool(cvars.byName.get("sv_cheats")?.value ?? undefined);
  const specOf = (name: string): CvarSpec => {
    const spec = practiceSpec(name);
    if (!spec) throw new Error(`No practice spec for ${name}`);
    return spec;
  };

  return (
    <div className="space-y-4">
      <SectionCard
        id="casual-section"
        title="Casual / Deathmatch"
        description={
          canRcon
            ? "Switch the server out of competitive for a warmup DM or a casual evening."
            : "Switching modes sends a raw command, which needs an admin account."
        }
        open={casualOpen}
        onToggle={() => setCasualOpen((v) => !v)}
      >
        {!canRcon && (
          <p className="text-xs/relaxed text-muted-foreground">
            These three tiles write <span className="font-mono">game_type</span>{" "}
            and <span className="font-mono">game_mode</span> over raw RCON, so
            they are admin-only. The mode is also a staged edit on the dashboard,
            which a moderator can see but not apply.
          </p>
        )}
        {canRcon && (
        <MatchActionGrid layout="casual">
          <MatchActionTile
            icon={GameController}
            label="Deathmatch"
            description="game_type 1 · game_mode 2"
            variant="outline"
            disabled={rcon.isPending}
            pending={rcon.isPending}
            onClick={() => rcon.mutate("game_type 1; game_mode 2")}
          />
          <MatchActionTile
            icon={Coffee}
            label="Casual"
            description="game_type 0 · game_mode 0"
            variant="outline"
            disabled={rcon.isPending}
            pending={rcon.isPending}
            onClick={() => rcon.mutate("game_type 0; game_mode 0")}
          />
          <MatchActionTile
            icon={ArrowCounterClockwise}
            label="Restart"
            description="mp_restartgame 1"
            variant="outline"
            disabled={rcon.isPending}
            pending={rcon.isPending}
            onClick={() => rcon.mutate("mp_restartgame 1")}
          />
        </MatchActionGrid>
        )}
      </SectionCard>

      <SectionCard
        id="practice-section"
        title="Practice"
        description="Bots, infinite ammo and grenade helpers for a solo or team practice session."
        open={practiceOpen}
        onToggle={() => setPracticeOpen((v) => !v)}
      >
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label htmlFor="sv-cheats">sv_cheats</Label>
            <p className="text-xs text-muted-foreground">
              Read from the server, not remembered here. While off, the
              cheat-dependent tiles below are locked and say so.
              {cheatsOn === null
                ? " The server has not reported a value yet."
                : ""}
            </p>
          </div>
          <Switch
            id="sv-cheats"
            checked={cheatsOn === true}
            disabled={cvars.setCvar.isPending || cheatsOn === null}
            onCheckedChange={(on) =>
              cvars.setCvar.mutate({
                name: "sv_cheats",
                value: on ? "1" : "0",
              })
            }
            aria-label="Toggle sv_cheats"
          />
        </div>

        <MatchActionGrid layout="practice">
          {/*
            Warmup and the bot commands are raw RCON (admin); everything after
            them is a cvar write (moderator). Same grid, same tiles, different
            route — so the four that a moderator cannot send are not drawn.
          */}
          {canRcon && (
            <>
              <MatchActionTile
                icon={FastForward}
                label="End warmup"
                description="mp_warmup_end"
                variant="outline"
                disabled={rcon.isPending}
                pending={rcon.isPending}
                onClick={() => rcon.mutate("mp_warmup_end")}
              />
              <MatchActionTile
                icon={Shield}
                label="Add CT bot"
                variant="outline"
                disabled={rcon.isPending}
                pending={rcon.isPending}
                onClick={() => rcon.mutate("bot_add_ct")}
              />
              <MatchActionTile
                icon={Fire}
                label="Add T bot"
                variant="outline"
                disabled={rcon.isPending}
                pending={rcon.isPending}
                onClick={() => rcon.mutate("bot_add_t")}
              />
              <MatchActionTile
                icon={Prohibit}
                label="Kick all bots"
                description="bot_kick"
                variant="outline"
                disabled={rcon.isPending}
                pending={rcon.isPending}
                onClick={() => rcon.mutate("bot_kick")}
              />
            </>
          )}
          <CvarTile
            spec={specOf("sv_infinite_ammo")}
            state={cvars.byName.get("sv_infinite_ammo")}
            icon={InfinityIcon}
            cheatsOn={cheatsOn}
            pending={cvars.setCvar.isPending}
            onSet={(value) =>
              cvars.setCvar.mutate({ name: "sv_infinite_ammo", value })
            }
          />
          <CvarTile
            spec={specOf("mp_buy_anywhere")}
            state={cvars.byName.get("mp_buy_anywhere")}
            icon={ShoppingCart}
            cheatsOn={cheatsOn}
            pending={cvars.setCvar.isPending}
            onSet={(value) =>
              cvars.setCvar.mutate({ name: "mp_buy_anywhere", value })
            }
          />
        </MatchActionGrid>

        <div className="space-y-3">
          <div>
            <h3 className="font-heading text-sm font-medium">
              Grenade practice
            </h3>
            <p className="mt-1 text-xs/relaxed text-muted-foreground">
              Server-side grenade helpers, which need{" "}
              <span className="font-medium text-foreground">sv_cheats</span> on.
              Each tile shows the value the server currently reports and toggles
              it back off again. Grenade <em>preview</em> is a client setting —
              the server cannot turn it on for you. Paste{" "}
              <code className="font-mono text-foreground">
                cl_grenadepreview 1
              </code>{" "}
              into your own console.
            </p>
          </div>
          <MatchActionGrid layout="nades">
            <CvarTile
              spec={specOf("sv_grenade_trajectory_prac_pipreview")}
              state={cvars.byName.get("sv_grenade_trajectory_prac_pipreview")}
              icon={PictureInPicture}
              cheatsOn={cheatsOn}
              pending={cvars.setCvar.isPending}
              onSet={(value) =>
                cvars.setCvar.mutate({
                  name: "sv_grenade_trajectory_prac_pipreview",
                  value,
                })
              }
            />
            <CvarTile
              spec={specOf("sv_grenade_trajectory_prac_trailtime")}
              state={cvars.byName.get("sv_grenade_trajectory_prac_trailtime")}
              icon={ChartLine}
              cheatsOn={cheatsOn}
              pending={cvars.setCvar.isPending}
              onSet={(value) =>
                cvars.setCvar.mutate({
                  name: "sv_grenade_trajectory_prac_trailtime",
                  value,
                })
              }
            />
            <CvarTile
              spec={specOf("ammo_grenade_limit_total")}
              state={cvars.byName.get("ammo_grenade_limit_total")}
              icon={Package}
              cheatsOn={cheatsOn}
              pending={cvars.setCvar.isPending}
              onSet={(value) =>
                cvars.setCvar.mutate({
                  name: "ammo_grenade_limit_total",
                  value,
                })
              }
            />
          </MatchActionGrid>
        </div>
      </SectionCard>
    </div>
  );
}
