"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Check, CaretDown, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MapPlaceholder } from "@/components/maps/map-placeholder";
import { getOfficialMapArtPath } from "@/lib/maps/official-art";
import {
  ACTIVE_DUTY_AS_OF,
  groupMapsForPool,
  activeDutyPool,
  RESERVE,
} from "@/lib/cs2/map-pools";
import { cn } from "@/lib/utils";
import type { MapEntry } from "@/lib/api/types";

/**
 * Picking the maps a match is played on.
 *
 * The previous version was a single alphabetical run of mono-text chips built
 * straight from `maps *`, which on a real server means `lake test` and
 * `Pool Day 3d Skybox` sitting between Inferno and Mirage, every entry the
 * same weight, and the seven maps anyone actually wants scattered through the
 * middle of twenty-five. Three things fix that:
 *
 *  - **Presets first.** Active Duty is one press, which is the whole pool for
 *    a normal competitive veto.
 *  - **Grouped by pool**, not alphabetically, so the competitive maps are the
 *    first thing on screen and the arms-race and community leftovers are
 *    folded away.
 *  - **Picture, not a name.** The panel already ships art for the maps that
 *    matter and generates a distinguishable tile for the rest; a map is far
 *    easier to recognise than to read.
 *
 * Pick order is shown on the tile because it is load-bearing: with the veto
 * skipped, MatchZy plays the pool in exactly this order.
 */
export function MapPoolPicker({
  maps,
  picked,
  onChange,
  skipVeto,
  onSkipVetoChange,
  numMaps,
}: {
  maps: MapEntry[];
  picked: string[];
  onChange: (next: string[]) => void;
  /** Drives the order hint — order only matters when the veto is skipped. */
  skipVeto: boolean;
  onSkipVetoChange: (skip: boolean) => void;
  numMaps: number;
}) {
  const [showOther, setShowOther] = useState(false);

  const groups = useMemo(() => groupMapsForPool(maps), [maps]);
  const byName = useMemo(
    () => new Map(maps.map((m) => [m.name, m])),
    [maps],
  );
  const activeDuty = useMemo(
    () => activeDutyPool(maps.map((m) => m.name)),
    [maps],
  );
  const reservePresent = useMemo(
    () => RESERVE.filter((m) => byName.has(m)),
    [byName],
  );

  /**
   * A preset is a pool *and* a veto. Both presets hand over more maps than any
   * series length here, which is the only situation where a veto does
   * anything — and leaving `skipVeto` on would quietly make MatchZy play the
   * seven in listed order instead, which is not what anyone pressing
   * "Active Duty" is asking for.
   */
  const applyPreset = (names: string[]) => {
    onChange(names);
    onSkipVetoChange(false);
  };

  const toggle = (name: string) =>
    onChange(
      picked.includes(name)
        ? picked.filter((m) => m !== name)
        : [...picked, name],
    );

  const tile = (name: string) => {
    const entry = byName.get(name);
    const index = picked.indexOf(name);
    const isPicked = index >= 0;
    const art = entry?.thumbnailUrl ?? getOfficialMapArtPath(name);
    return (
      <button
        key={name}
        type="button"
        aria-pressed={isPicked}
        onClick={() => toggle(name)}
        className={cn(
          "group relative aspect-video overflow-hidden border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isPicked
            ? "border-primary ring-1 ring-primary"
            : "border-foreground/10 hover:border-foreground/30",
        )}
      >
        {art ? (
          <Image
            src={art}
            alt=""
            fill
            sizes="(max-width: 640px) 33vw, 20vw"
            className={cn(
              "object-cover object-center transition",
              isPicked ? "opacity-90" : "opacity-55 group-hover:opacity-75",
            )}
          />
        ) : (
          <MapPlaceholder name={name} />
        )}

        {/*
          A scrim rather than a translucent card: the label has to stay legible
          over whatever the screenshot happens to be behind it, and these are
          bright, busy images.
        */}
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-6">
          <span className="block truncate text-xs font-medium text-white">
            {entry?.displayName ?? name}
          </span>
        </span>

        {isPicked && (
          <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold tabular-nums text-primary-foreground">
            {skipVeto ? index + 1 : <Check weight="bold" className="size-3.5" />}
          </span>
        )}
      </button>
    );
  };

  const section = (label: string, names: string[], note?: string) =>
    names.length === 0 ? null : (
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </h4>
          {note && (
            <span className="text-xs text-muted-foreground/80">{note}</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {names.map(tile)}
        </div>
      </div>
    );

  const enoughForVeto = !skipVeto && picked.length > numMaps;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="mr-auto text-xs uppercase tracking-wide text-muted-foreground">
          Map pool
        </Label>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11 sm:min-h-8"
          disabled={activeDuty.present.length === 0}
          onClick={() => applyPreset(activeDuty.present)}
        >
          Active Duty · {activeDuty.present.length}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11 sm:min-h-8"
          disabled={reservePresent.length === 0}
          onClick={() => applyPreset([...reservePresent])}
        >
          Reserve · {reservePresent.length}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="min-h-11 sm:min-h-8"
          disabled={picked.length === 0}
          onClick={() => onChange([])}
        >
          <X className="size-4" />
          Clear
        </Button>
      </div>

      <p className="text-xs/relaxed text-muted-foreground">
        {picked.length === 0
          ? "Nothing picked yet. Active Duty is the seven-map pool a competitive veto runs on."
          : skipVeto
            ? `${picked.length} map${picked.length === 1 ? "" : "s"}, played in the numbered order — the veto is off, so MatchZy takes them as they are.`
            : enoughForVeto
              ? `${picked.length} maps for a best-of-${numMaps}; the teams veto down from these.`
              : `${picked.length} map${picked.length === 1 ? "" : "s"} for a best-of-${numMaps}.`}
      </p>

      {activeDuty.missing.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Active Duty is the pool as of {ACTIVE_DUTY_AS_OF}. This server does not
          have{" "}
          {activeDuty.missing
            .map((m) => byName.get(m)?.displayName ?? m)
            .join(", ")}{" "}
          installed, so the preset picks {activeDuty.present.length} of 7.
        </p>
      )}

      {section("Active Duty", groups.activeDuty)}
      {section("Reserve", groups.reserve, "in rotation, out of Active Duty")}

      {(groups.other.length > 0 || groups.workshop.length > 0) && (
        <div className="space-y-3">
          <button
            type="button"
            aria-expanded={showOther}
            onClick={() => setShowOther((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <CaretDown
              className={cn("size-3.5 transition-transform", showOther && "rotate-180")}
            />
            Everything else installed ·{" "}
            {groups.other.length + groups.workshop.length}
          </button>
          {showOther && (
            <div className="space-y-3">
              {section("Other official", groups.other)}
              {section("Workshop", groups.workshop)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
