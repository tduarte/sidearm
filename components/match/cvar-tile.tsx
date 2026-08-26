"use client";

import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { MatchActionTile } from "@/components/match/match-action-tile";
import { asBool, asInt } from "@/lib/cs2/cvars";
import { offValueFor } from "@/lib/cs2/practice";
import type { CvarSpec, CvarState } from "@/lib/api/types";

/**
 * A practice cvar rendered from what the server says it is.
 *
 * These were one-shot buttons that wrote a value and never read one back: once
 * pressed, the only way to undo them was the raw console, and the tile gave no
 * hint of the current state. Four states are now distinguishable — on, off,
 * unknown (no answer yet) and unsupported (the build has no such cvar) — and
 * unknown deliberately does not render as off.
 */
export function CvarTile({
  spec,
  state,
  icon,
  cheatsOn,
  pending,
  onSet,
}: {
  spec: CvarSpec;
  state: CvarState | undefined;
  icon: ComponentType<IconProps>;
  cheatsOn: boolean | null;
  pending: boolean;
  onSet: (value: string) => void;
}) {
  if (state && !state.supported) {
    return (
      <MatchActionTile
        icon={icon}
        label={spec.label}
        description="not on this CS2 build"
        variant="outline"
        disabled
        onClick={() => {}}
      />
    );
  }

  const raw = state?.value ?? null;
  const isOn =
    spec.kind === "toggle"
      ? asBool(raw ?? undefined)
      : raw === null
        ? null
        : asInt(raw) !== asInt(spec.off);

  // sv_cheats itself is not cheat-protected; the tiles that depend on it are.
  const locked = spec.cheatProtected && cheatsOn !== true;

  const description = (() => {
    if (locked) return "needs sv_cheats 1";
    if (raw === null) return "no answer from the server yet";
    if (spec.kind === "stepper") return `${spec.name} ${raw}`;
    return spec.name;
  })();

  const variant = (() => {
    if (raw === null) return "unknown" as const;
    return isOn ? ("toggle" as const) : ("outline" as const);
  })();

  return (
    <MatchActionTile
      icon={icon}
      label={spec.label}
      description={description}
      variant={variant}
      pressed={isOn ?? undefined}
      disabled={pending || locked}
      pending={pending}
      onClick={() =>
        onSet(isOn ? offValueFor(spec, state?.baseline ?? null) : spec.on)
      }
    />
  );
}
