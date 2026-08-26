"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Prohibit } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import type { BanRecord } from "@/lib/cs2/bans";

/** Who is banned, and until when — the panel is the authority on the clock. */
export function BanList() {
  const qc = useQueryClient();

  const bans = useQuery<BanRecord[]>({
    queryKey: ["bans"],
    queryFn: () => api.getBans(),
    refetchInterval: 60_000,
  });

  const unban = useMutation({
    mutationFn: (steamId: string) => api.unbanPlayer(steamId),
    meta: { action: "Lifting the ban" },
    onSuccess: () => {
      toast.success("Ban lifted");
      qc.invalidateQueries({ queryKey: ["bans"] });
    },
  });

  // Nothing banned and nothing loading: don't take up space saying so.
  if (!bans.isPending && (bans.data?.length ?? 0) === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Prohibit className="h-4 w-4" />
          Bans
        </CardTitle>
        <CardDescription>
          CS2 keeps bans in memory only, so the panel holds the expiry and
          re-applies them if the container restarts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {bans.isPending ? (
          <Skeleton className="h-16" />
        ) : (
          <ul className="space-y-1.5">
            {(bans.data ?? []).map((b) => (
              <li
                key={b.steamId}
                className="flex flex-wrap items-center gap-3 border px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {b.name}
                  </span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {b.steamId}
                    {b.reason ? ` · ${b.reason}` : ""}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {b.expiresAt
                    ? `until ${new Date(b.expiresAt).toLocaleString()}`
                    : "no expiry"}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={unban.isPending}
                  onClick={() => unban.mutate(b.steamId)}
                >
                  Lift
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
