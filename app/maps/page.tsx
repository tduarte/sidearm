"use client";

import { useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { LoadError } from "@/components/load-error";
import { RotationCard } from "@/components/maps/rotation-card";
import { MapPlaceholder } from "@/components/maps/map-placeholder";
import { DangerConfirm } from "@/components/danger-confirm";
import { api } from "@/lib/api/client";
import {
  formatElapsed,
  usePendingOp,
} from "@/lib/hooks/use-pending-op";
import { getOfficialMapArtPath } from "@/lib/maps/official-art";
import { isSameMap } from "@/lib/cs2/workshop";

function parseWorkshopInput(s: string): string | null {
  const trimmed = s.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/filedetails\/\?id=(\d+)/);
  if (m) return m[1];
  return null;
}

export default function MapsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["maps"],
    queryFn: () => api.getMaps(),
  });

  const { op: pendingOp, elapsedSec } = usePendingOp();
  const mapPending = pendingOp?.kind === "map" ? pendingOp : null;

  const changeMap = useMutation({
    mutationFn: (name: string) => api.changeMap(name),
    meta: { action: "Map change" },
    // Not "Changing map to X" as a success: at this point the server has only
    // accepted the command. The tile carries the pending state until the poll
    // reports the level has actually loaded.
    onSuccess: (_, name) => {
      toast(`Asked the server to load ${name}`, {
        description: "Workshop maps download first; this can take a minute.",
      });
      qc.invalidateQueries({ queryKey: ["maps"] });
      qc.invalidateQueries({ queryKey: ["status"] });
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const subscribe = useMutation({
    mutationFn: ({ id, name }: { id: string; name?: string }) =>
      api.subscribeWorkshop(id, name),
    meta: { action: "Adding the workshop map" },
    onSuccess: () => {
      toast.success("Workshop map added");
      qc.invalidateQueries({ queryKey: ["maps"] });
    },
  });

  const unsubscribe = useMutation({
    mutationFn: (id: string) => api.unsubscribeWorkshop(id),
    meta: { action: "Removing the workshop map" },
    onSuccess: () => {
      toast.success("Workshop map removed", {
        description:
          "The panel forgets it; the downloaded files stay until the cs2-data volume is wiped.",
      });
      qc.invalidateQueries({ queryKey: ["maps"] });
    },
  });

  const [subOpen, setSubOpen] = useState(false);
  const [subInput, setSubInput] = useState("");
  const [subName, setSubName] = useState("");

  if (error && !data) {
    return <LoadError what="the map list" error={error} onRetry={() => refetch()} />;
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const current = data.current;
  const workshop = data.all.filter((m) => m.type === "workshop");
  const official = data.all.filter((m) => m.type === "official");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Maps</h1>
          <p className="text-sm text-muted-foreground">
            Current: <span className="font-mono">{current}</span>
          </p>
        </div>
        <Dialog open={subOpen} onOpenChange={setSubOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              Add workshop map
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Subscribe to a Workshop map</DialogTitle>
              <DialogDescription>
                Paste a Steam Workshop URL or numeric ID.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ws-id">Workshop URL or ID</Label>
                <Input
                  id="ws-id"
                  value={subInput}
                  onChange={(e) => setSubInput(e.target.value)}
                  placeholder="e.g. 3070563536 or a …filedetails/?id=… URL"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ws-name">Display name (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the map&apos;s own Workshop title.
                </p>
                <Input
                  id="ws-name"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  placeholder="e.g. aim_botz"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setSubOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const id = parseWorkshopInput(subInput);
                  if (!id) {
                    toast.error("Couldn't parse a workshop ID");
                    return;
                  }
                  subscribe.mutate({ id, name: subName || undefined });
                  setSubOpen(false);
                  setSubInput("");
                  setSubName("");
                }}
                disabled={!subInput.trim() || subscribe.isPending}
              >
                Subscribe
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <RotationCard maps={data.all} current={current} />

      {/*
        The heading stays when the list is empty. Hiding the section entirely
        meant a fresh install had no way to learn that workshop maps are
        supported at all — the feature was invisible until you already knew
        about it, which is the wrong way round.
      */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Workshop
        </h2>
        {workshop.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            <p>No workshop maps subscribed.</p>
            <p className="mt-1 text-xs">
              Paste a Steam Workshop URL or ID above and the server downloads it
              on first load. Community maps, surf, retakes — anything with a
              workshop page.
            </p>
          </div>
        ) : (
        <div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {workshop.map((m) => (
              <MapTile
                key={m.name}
                name={m.name}
                displayName={m.displayName}
                imageSrc={m.thumbnailUrl ?? getOfficialMapArtPath(m.name)}
                badge={m.workshopId}
                onRemove={() =>
                  m.workshopId ? unsubscribe.mutate(m.workshopId) : undefined
                }
                isCurrent={isSameMap(m.name, current)}
                isBusy={changeMap.isPending || !!mapPending}
                isLoadingNow={!!mapPending && isSameMap(m.name, mapPending.target ?? "")}
                elapsedSec={elapsedSec}
                onPlay={() => changeMap.mutate(m.name)}
              />
            ))}
          </div>
        </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Official
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {official.map((m) => (
            <MapTile
              key={m.name}
              name={m.name}
              displayName={m.displayName}
              imageSrc={getOfficialMapArtPath(m.name)}
              isCurrent={isSameMap(m.name, current)}
              isBusy={changeMap.isPending || !!mapPending}
              isLoadingNow={!!mapPending && isSameMap(m.name, mapPending.target ?? "")}
              elapsedSec={elapsedSec}
              onPlay={() => changeMap.mutate(m.name)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MapTile({
  name,
  displayName,
  imageSrc,
  badge,
  isCurrent,
  isBusy,
  isLoadingNow,
  elapsedSec,
  onPlay,
  onRemove,
}: {
  name: string;
  displayName: string;
  imageSrc?: string;
  badge?: string;
  isCurrent: boolean;
  isBusy?: boolean;
  /** This is the map the server was asked for and has not loaded yet. */
  isLoadingNow?: boolean;
  elapsedSec?: number;
  onPlay: () => void;
  /** Workshop maps only — official maps ship with the game. */
  onRemove?: () => void;
}) {
  return (
    <Card
      className={cn(
        "relative w-full overflow-hidden pt-0 transition",
        isCurrent && "ring-2 ring-primary",
        isLoadingNow && "ring-2 ring-pending/70",
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={`${displayName} preview`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover object-center"
          />
        ) : (
          <MapPlaceholder name={name} />
        )}
      </div>
      <CardHeader className="gap-2">
        {(isCurrent || badge || isLoadingNow) && (
          <CardAction>
            {isLoadingNow ? (
              <Badge className="gap-1.5 border-pending/30 bg-pending/12 text-pending">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pending" />
                Loading
              </Badge>
            ) : isCurrent ? (
              <Badge>Live</Badge>
            ) : (
              <Badge variant="secondary">Workshop</Badge>
            )}
          </CardAction>
        )}
        <CardTitle className="text-base">{displayName}</CardTitle>
        <CardDescription className="space-y-1">
          <span className="block font-mono text-xs">{name}</span>
          {badge ? (
            <span className="block text-muted-foreground">
              Workshop id {badge}
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex-col items-stretch gap-2">
        {isLoadingNow ? (
          <>
            <Button className="w-full" variant="secondary" disabled>
              Loading · {formatElapsed(elapsedSec ?? 0)}
            </Button>
            <p className="text-center text-[0.65rem] leading-snug text-muted-foreground">
              Workshop maps download before they load. The tile clears when the
              server reports the new map.
            </p>
          </>
        ) : isCurrent ? (
          <Button className="w-full" variant="secondary" disabled>
            Current map
          </Button>
        ) : (
          <DangerConfirm
            title={`Change the map to ${displayName}?`}
            consequence="Everyone connected is pulled into the new map, ending the current round. A workshop map downloads first, which can take about a minute."
            operation={
              badge ? `host_workshop_map ${badge}` : `changelevel ${name}`
            }
            confirmLabel="Change map"
            onConfirm={onPlay}
          >
            {(arm) => (
              <Button className="w-full" onClick={arm} disabled={isBusy}>
                Play
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </DangerConfirm>
        )}
        {onRemove && !isCurrent && (
          <DangerConfirm
            title={`Remove ${displayName} from the list?`}
            consequence="The panel forgets this map. The files it already downloaded stay in the cs2-data volume until that volume is wiped, and adding the ID again brings it straight back."
            operation={`forget workshop ${badge}`}
            confirmLabel="Remove"
            onConfirm={onRemove}
          >
            {(arm) => (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={arm}
                disabled={isBusy}
              >
                <Trash className="h-4 w-4" />
                Remove
              </Button>
            )}
          </DangerConfirm>
        )}
      </CardFooter>
    </Card>
  );
}
