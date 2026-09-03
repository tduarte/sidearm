"use client";

/**
 * What the server *has*, as opposed to what it is playing.
 *
 * The Maps page used to be both: a grid of every installed map with a Play
 * button on each tile, plus the rotation and the workshop subscriptions. The
 * two halves answer different questions and were only together because they
 * both mention maps.
 *
 * Choosing what to play is a live decision, so it moved to the dashboard's map
 * sheet and the ⌘K palette, next to the thing it changes. What is left here is
 * the library: which maps exist on this box, and which order they cycle in.
 * That is administration, it is done rarely, and it does not belong on the
 * stage.
 *
 * Both halves are admin: subscribing downloads gigabytes onto the host, and a
 * rotation outlives the session that set it.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
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
import { DangerConfirm } from "@/components/danger-confirm";
import { LoadError } from "@/components/load-error";
import { RotationCard } from "@/components/maps/rotation-card";
import { api } from "@/lib/api/client";
import { isSameMap } from "@/lib/cs2/workshop";

/** Accepts either the numeric id or the whole Workshop URL someone pasted. */
function parseWorkshopInput(s: string): string | null {
  const trimmed = s.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/filedetails\/\?id=(\d+)/);
  if (m) return m[1];
  return null;
}

export function MapsCard() {
  const qc = useQueryClient();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["maps"],
    queryFn: () => api.getMaps(),
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

  if (isPending || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const workshop = data.all.filter((m) => m.type === "workshop");
  const official = data.all.filter((m) => m.type === "official");

  return (
    <div className="space-y-4">
      <RotationCard maps={data.all} current={data.current} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Workshop maps</CardTitle>
          <CardDescription>
            Anything with a Workshop page — community maps, surf, retakes. The
            server downloads one the first time it loads it, which takes about a
            minute.
          </CardDescription>
          <CardAction>
            <Dialog open={subOpen} onOpenChange={setSubOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  Add
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
          </CardAction>
        </CardHeader>
        <CardContent>
          {/*
            The empty state keeps the section rather than hiding it. Hiding it
            meant a fresh install had no way to learn that workshop maps are
            supported at all — the feature was invisible until you already knew
            about it, which is the wrong way round.
          */}
          {workshop.length === 0 ? (
            <p className="border border-dashed p-4 text-center text-xs text-muted-foreground">
              None subscribed yet. Add one above and it appears in the map
              sheet on the dashboard.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {workshop.map((m) => {
                const live = isSameMap(m.name, data.current);
                return (
                  <li
                    key={m.name}
                    className="flex flex-wrap items-center gap-3 border px-3 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {m.displayName}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {m.workshopId ? `id ${m.workshopId} · ` : ""}
                        {m.name}
                      </span>
                    </span>
                    {live && (
                      <span className="text-xs text-muted-foreground">
                        on air
                      </span>
                    )}
                    {/*
                      Removing the map the server is currently running would
                      leave the panel unable to name what is on screen, so the
                      one map you cannot forget is the one you are playing.
                    */}
                    {m.workshopId && !live && (
                      <DangerConfirm
                        title={`Remove ${m.displayName} from the list?`}
                        consequence="The panel forgets this map. The files it already downloaded stay in the cs2-data volume until that volume is wiped, and adding the ID again brings it straight back."
                        operation={`forget workshop ${m.workshopId}`}
                        confirmLabel="Remove"
                        onConfirm={() => unsubscribe.mutate(m.workshopId!)}
                      >
                        {(arm) => (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={arm}
                            disabled={unsubscribe.isPending}
                          >
                            <Trash className="h-4 w-4" />
                            Remove
                          </Button>
                        )}
                      </DangerConfirm>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Plus {official.length} official map
            {official.length === 1 ? "" : "s"} that ship with the game.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
