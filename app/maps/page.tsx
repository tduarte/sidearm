"use client";

import { useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, MapPin, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
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
import { api } from "@/lib/api/client";
import { getOfficialMapArtPath } from "@/lib/maps/official-art";

function parseWorkshopInput(s: string): string | null {
  const trimmed = s.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/filedetails\/\?id=(\d+)/);
  if (m) return m[1];
  return null;
}

export default function MapsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["maps"],
    queryFn: () => api.getMaps(),
  });

  const changeMap = useMutation({
    mutationFn: (name: string) => api.changeMap(name),
    onSuccess: (_, name) => {
      toast.success(`Changing map to ${name}`);
      qc.invalidateQueries({ queryKey: ["maps"] });
      qc.invalidateQueries({ queryKey: ["status"] });
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const subscribe = useMutation({
    mutationFn: ({ id, name }: { id: string; name?: string }) =>
      api.subscribeWorkshop(id, name),
    onSuccess: () => {
      toast.success("Workshop map added");
      qc.invalidateQueries({ queryKey: ["maps"] });
    },
  });

  const [subOpen, setSubOpen] = useState(false);
  const [subInput, setSubInput] = useState("");
  const [subName, setSubName] = useState("");

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
                  placeholder="3070602404 or …filedetails/?id=3070602404"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ws-name">Display name (optional)</Label>
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

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base">Rotation</CardTitle>
          <Badge variant="outline">{data.rotation.length} maps</Badge>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {data.rotation.map((m) => (
              <Badge
                key={m}
                variant={m === current ? "default" : "secondary"}
                className="gap-1.5"
              >
                {m === current && <MapPin className="h-3 w-3" />}
                {m}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {workshop.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Workshop
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {workshop.map((m) => (
              <MapTile
                key={m.name}
                name={m.name}
                displayName={m.displayName}
                imageSrc={getOfficialMapArtPath(m.name)}
                badge={m.workshopId}
                isCurrent={m.name === current}
                isBusy={changeMap.isPending}
                onPlay={() => changeMap.mutate(m.name)}
              />
            ))}
          </div>
        </div>
      )}

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
              isCurrent={m.name === current}
              isBusy={changeMap.isPending}
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
  onPlay,
}: {
  name: string;
  displayName: string;
  imageSrc?: string;
  badge?: string;
  isCurrent: boolean;
  isBusy?: boolean;
  onPlay: () => void;
}) {
  return (
    <Card
      className={cn(
        "relative w-full overflow-hidden pt-0 transition",
        isCurrent && "ring-2 ring-primary",
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
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950">
            <MapPin className="h-10 w-10 text-zinc-600" weight="duotone" />
          </div>
        )}
      </div>
      <CardHeader className="gap-2">
        {(isCurrent || badge) && (
          <CardAction>
            {isCurrent ? (
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
      <CardFooter>
        {isCurrent ? (
          <Button className="w-full" variant="secondary" disabled>
            Current map
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={onPlay}
            disabled={isBusy}
          >
            Play
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
