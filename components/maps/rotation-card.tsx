"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, MapPin, Plus, X } from "@phosphor-icons/react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api/client";
import { isSameMap } from "@/lib/cs2/workshop";
import type { MapEntry } from "@/lib/api/types";
import type { RotationState } from "@/lib/cs2/rotation";
import { useState } from "react";

/**
 * Map rotation, driven by the panel.
 *
 * This card used to render `data.rotation`, which the real adapter hardcoded to
 * an empty array — so it could only ever say "0 maps" over an empty row.
 */
export function RotationCard({
  maps,
  current,
}: {
  maps: MapEntry[];
  current: string;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState("");

  const rotation = useQuery<RotationState>({
    queryKey: ["rotation"],
    queryFn: () => api.getRotation(),
  });

  const save = useMutation({
    mutationFn: (next: { enabled?: boolean; maps?: string[] }) =>
      api.putRotation(next),
    meta: { action: "Saving the rotation" },
    onSuccess: (state) => {
      qc.setQueryData(["rotation"], state);
      qc.invalidateQueries({ queryKey: ["maps"] });
    },
  });

  const state = rotation.data ?? { enabled: false, maps: [] };
  const nameOf = (name: string) =>
    maps.find((m) => isSameMap(m.name, name))?.displayName ?? name;

  const move = (index: number, delta: number) => {
    const next = [...state.maps];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    save.mutate({ maps: next });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Rotation</CardTitle>
            <CardDescription>
              The panel loads the next map when a match ends, so it only
              advances while the panel is running. Workshop maps work here,
              which is why this is not a <code>mapcycle.txt</code>.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {state.enabled ? "On" : "Off"}
            </span>
            <Switch
              checked={state.enabled}
              disabled={save.isPending || state.maps.length === 0}
              onCheckedChange={(enabled) => save.mutate({ enabled })}
              aria-label="Enable map rotation"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rotation.isPending ? (
          <Skeleton className="h-16" />
        ) : state.maps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rotation set. Add maps below and the server will cycle through
            them as matches finish.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {state.maps.map((name, i) => {
              const isCurrent = isSameMap(name, current);
              return (
                <li
                  key={name}
                  className="flex items-center gap-2 border px-2 py-1.5"
                >
                  <span className="w-5 text-xs tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  {isCurrent && (
                    <Badge variant="default" className="gap-1">
                      <MapPin className="h-3 w-3" />
                      Now
                    </Badge>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {nameOf(name)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label={`Move ${nameOf(name)} up`}
                    disabled={i === 0 || save.isPending}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label={`Move ${nameOf(name)} down`}
                    disabled={i === state.maps.length - 1 || save.isPending}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${nameOf(name)} from the rotation`}
                    disabled={save.isPending}
                    onClick={() =>
                      save.mutate({
                        maps: state.maps.filter((m) => m !== name),
                      })
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ol>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Select value={adding} onValueChange={setAdding}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Add a map…" />
            </SelectTrigger>
            <SelectContent>
              {maps
                .filter((m) => !state.maps.includes(m.name))
                .map((m) => (
                  <SelectItem key={m.name} value={m.name}>
                    {m.displayName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={!adding || save.isPending}
            onClick={() => {
              save.mutate(
                { maps: [...state.maps, adding] },
                {
                  onSuccess: () => {
                    toast.success(`${nameOf(adding)} added to the rotation`);
                    setAdding("");
                  },
                },
              );
            }}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
