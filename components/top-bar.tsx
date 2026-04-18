"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowsClockwise, Play, Stop, UsersThree, MapPin } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { StatusPill } from "@/components/status-pill";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import { api } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";

export function TopBar() {
  const { data: status, isLoading } = useServerStatus();
  const qc = useQueryClient();

  const restart = useMutation({
    mutationFn: () => api.restart(),
    onSuccess: () => {
      toast.success("Server restarting");
      qc.invalidateQueries({ queryKey: ["status"] });
    },
  });

  const toggle = useMutation({
    mutationFn: (next: "running" | "stopped") => api.setServerState(next),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["status"] }),
  });

  return (
    <header className="flex h-14 items-center gap-3 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-5" />
      {isLoading || !status ? (
        <Skeleton className="h-6 w-24" />
      ) : (
        <>
          <StatusPill state={status.state} />
          <div className="hidden items-center gap-3 text-sm text-muted-foreground sm:flex">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {status.map}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UsersThree className="h-3.5 w-3.5" />
              {status.players}/{status.maxPlayers}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {status.state === "running" ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => restart.mutate()}
                  disabled={restart.isPending}
                >
                  <ArrowsClockwise className="h-4 w-4" />
                  Restart
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => toggle.mutate("stopped")}
                  disabled={toggle.isPending}
                >
                  <Stop className="h-4 w-4" weight="fill" />
                  Stop
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => toggle.mutate("running")}
                disabled={toggle.isPending || status.state === "starting"}
              >
                <Play className="h-4 w-4" weight="fill" />
                Start
              </Button>
            )}
          </div>
        </>
      )}
    </header>
  );
}
