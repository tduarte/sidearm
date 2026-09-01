"use client";

/**
 * "We're playing Wingman tonight" as one click.
 *
 * Setting up a new server is the moment the panel is least helpful: the form
 * below asks for a mode, a slot count and a bot quota as if they were
 * independent, when in practice picking Wingman determines all three. This card
 * makes the mode the choice and the numbers a consequence.
 *
 * It is scrupulous about what it can and cannot do. The cvar half fills the
 * form and is applied by the same Save button as everything else. The launch
 * argument half — the slot ceiling — cannot be changed by a process running
 * inside the compose project, so the card prints the two things a human needs
 * (the `.env` lines and the one command) rather than a button that would
 * appear to work and not.
 */

import { useState } from "react";
import { CheckCircle, Copy, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BOOT_APPLY_COMMAND,
  PRESETS,
  bootDiffers,
  envLines,
  type ModePreset,
} from "@/lib/presets";
import { cn } from "@/lib/utils";

function copy(text: string, what: string) {
  navigator.clipboard.writeText(text);
  toast(`${what} copied`);
}

/**
 * What still has to happen on the host, stated exactly.
 *
 * Shown only when the running container's slot ceiling actually disagrees with
 * the preset — telling someone to recreate a container that is already correct
 * is how a panel teaches people to ignore it.
 */
function BootTier({
  preset,
  installedMaxPlayers,
}: {
  preset: ModePreset;
  installedMaxPlayers: number | null | undefined;
}) {
  const differs = bootDiffers(preset, installedMaxPlayers);
  const lines = envLines(preset);

  if (differs === false) {
    return (
      <p className="flex items-center gap-2 text-xs text-ok">
        <CheckCircle className="size-4 shrink-0" weight="fill" />
        The container already has {preset.boot.CS2_MAXPLAYERS} slots — nothing
        to recreate.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-warn/30 bg-warn/8 p-3">
      <p className="flex items-start gap-2 text-xs">
        <Warning className="mt-0.5 size-4 shrink-0 text-warn" weight="fill" />
        <span>
          {differs === null ? (
            <>
              The panel has not read the container&rsquo;s slot count yet, so it
              cannot say whether this part is already done.
            </>
          ) : (
            <>
              The slot ceiling is a launch argument, so the panel cannot change
              it. The server currently has {installedMaxPlayers} slot
              {installedMaxPlayers === 1 ? "" : "s"} and this preset wants{" "}
              {preset.boot.CS2_MAXPLAYERS}.
            </>
          )}{" "}
          Edit <code className="font-mono">.env</code> on the host and recreate
          the container.{" "}
          <strong className="font-medium">Everyone connected is dropped.</strong>
        </span>
      </p>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
            .env
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => copy(lines.join("\n"), ".env lines")}
          >
            <Copy className="size-3.5" />
            Copy
          </Button>
        </div>
        <pre className="overflow-x-auto rounded bg-muted/60 p-2 font-mono text-xs leading-relaxed">
          {lines.join("\n")}
        </pre>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
            then
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => copy(BOOT_APPLY_COMMAND, "Command")}
          >
            <Copy className="size-3.5" />
            Copy
          </Button>
        </div>
        <pre className="overflow-x-auto rounded bg-muted/60 p-2 font-mono text-xs">
          {BOOT_APPLY_COMMAND}
        </pre>
      </div>
    </div>
  );
}

export function PresetPicker({
  installedMaxPlayers,
  onApply,
}: {
  installedMaxPlayers: number | null | undefined;
  /** Fills the form below. Nothing is sent until the operator saves. */
  onApply: (preset: ModePreset) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const preset = PRESETS.find((p) => p.id === selected) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Presets</CardTitle>
        <CardDescription>
          Pick how you are playing tonight. The settings below fill in to match;
          nothing is sent until you save.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PRESETS.map((p) => {
            const active = p.id === selected;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setSelected(p.id);
                  onApply(p);
                }}
                className={cn(
                  "flex flex-col gap-1 rounded-md border p-3 text-left transition-colors",
                  "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active && "border-primary bg-accent",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{p.label}</span>
                  <Badge variant="secondary" className="shrink-0 text-[0.6875rem]">
                    {p.shape}
                  </Badge>
                </span>
                <span className="text-xs text-muted-foreground">{p.tagline}</span>
                {/*
                  The two numbers are different things and the card used to
                  print only the larger one: `CS2_MAXPLAYERS` is the launch
                  ceiling, which includes GOTV's slot, so a 2v2 advertised
                  itself as "5 slots". Say what people get, then what the
                  container needs — and read GOTV from the preset rather than
                  asserting it in a string that cannot go stale honestly.
                */}
                <span className="mt-1 font-mono text-[0.6875rem] text-muted-foreground">
                  {p.live.visibleMaxPlayers} players · {p.boot.CS2_MAXPLAYERS}{" "}
                  slots{p.boot.TV_ENABLE ? " with GOTV" : ""}
                </span>
              </button>
            );
          })}
        </div>

        {preset && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">{preset.why}</p>
            <BootTier preset={preset} installedMaxPlayers={installedMaxPlayers} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
