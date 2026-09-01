"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { FloppyDisk } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/load-error";
import { PresetPicker } from "@/components/config/preset-picker";
import { api } from "@/lib/api/client";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import type { ModePreset } from "@/lib/presets";
import type { ServerConfig } from "@/lib/api/types";

const schema = z.object({
  identity: z.object({
    hostname: z.string().min(1).max(128),
  }),
  access: z.object({
    serverPassword: z.string(),
  }),
  gameplay: z.object({
    mode: z.enum([
      "competitive",
      "wingman",
      "deathmatch",
      "casual",
      "practice",
      "custom",
    ]),
    visibleMaxPlayers: z.coerce.number().min(1).max(64),
    botsEnabled: z.boolean(),
    botDifficulty: z.enum(["0", "1", "2", "3"]),
    botQuota: z.coerce.number().min(0).max(32),
  }),
});

type FormValues = z.infer<typeof schema>;

function toForm(c: ServerConfig): FormValues {
  return {
    identity: { hostname: c.identity.hostname },
    access: { serverPassword: c.access.serverPassword },
    gameplay: {
      mode: c.gameplay.mode as FormValues["gameplay"]["mode"],
      visibleMaxPlayers: c.gameplay.visibleMaxPlayers,
      botsEnabled: c.gameplay.botsEnabled,
      botDifficulty: String(c.gameplay.botDifficulty) as "0" | "1" | "2" | "3",
      botQuota: c.gameplay.botQuota,
    },
  };
}

function fromForm(v: FormValues): ServerConfig {
  return {
    identity: { hostname: v.identity.hostname },
    access: { serverPassword: v.access.serverPassword },
    gameplay: {
      mode: v.gameplay.mode,
      visibleMaxPlayers: v.gameplay.visibleMaxPlayers,
      botsEnabled: v.gameplay.botsEnabled,
      botDifficulty: Number(v.gameplay.botDifficulty) as 0 | 1 | 2 | 3,
      botQuota: v.gameplay.botQuota,
    },
  };
}

export default function ConfigPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["config"],
    queryFn: () => api.getConfig(),
  });

  if (error && !data) {
    return <LoadError what="the server config" error={error} onRetry={() => refetch()} />;
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="space-y-3 rounded-lg border p-6">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="space-y-3 rounded-lg border p-6">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-9 w-1/2" />
        </div>
      </div>
    );
  }

  return <ConfigForm initial={toForm(data)} />;
}

function ConfigForm({ initial }: { initial: FormValues }) {
  const qc = useQueryClient();
  const { data: status } = useServerStatus();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: initial,
  });

  const save = useMutation({
    mutationFn: (v: FormValues) => api.putConfig(fromForm(v)),
    meta: { action: "Saving the config" },
    onSuccess: () => {
      toast.success("Applied to the running server", {
        description: "Saved too, so a restart will not undo it.",
      });
      qc.invalidateQueries({ queryKey: ["config"] });
      qc.invalidateQueries({ queryKey: ["status"] });
    },
  });

  /**
   * A preset writes the form, not the server. `shouldDirty` is what arms the
   * Save button, so the operator still confirms.
   *
   * Only the slot count: the mode and the bots are staged by the same preset
   * on the dashboard, next to the values they change. Setting them from here
   * as well would be two places writing one setting, and the loser would be
   * whichever page was saved second.
   */
  const applyPreset = (p: ModePreset) => {
    form.setValue("gameplay.visibleMaxPlayers", p.live.visibleMaxPlayers, {
      shouldDirty: true,
      shouldTouch: true,
    });
    toast(`${p.label} slots filled in`, {
      description: "Review it and hit Save changes to apply.",
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Config</h1>
            {/*
              The old subtitle said "Changes take effect on next server
              restart", which was backwards in both directions: these apply
              immediately, and they used to be LOST on restart.
            */}
            <p className="text-sm text-muted-foreground">
              Applied immediately over RCON, and re-applied if the server
              restarts.
            </p>
          </div>
          <Button type="submit" disabled={!form.formState.isDirty || save.isPending}>
            <FloppyDisk className="h-4 w-4" />
            Save changes
          </Button>
        </div>

        <PresetPicker
          installedMaxPlayers={status?.maxPlayers}
          onApply={applyPreset}
        />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Slots</CardTitle>
            <CardDescription>
              How full the server says it is. The mode, bots, name and password
              moved to the dashboard, where the value you are looking at is the
              one you change.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="gameplay.visibleMaxPlayers"
              render={({ field }) => (
                <FormItem className="max-w-sm">
                  <FormLabel>Advertised slots</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={status?.maxPlayers ?? 64}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    <span className="font-mono">sv_visiblemaxplayers</span> —
                    what the server browser shows, and what &ldquo;server
                    full&rdquo; is measured against. A preset above moves it to
                    that mode&apos;s usual size.{" "}
                    {status?.maxPlayers != null && (
                      <>
                        The ceiling is{" "}
                        <span className="font-medium text-foreground">
                          {status.maxPlayers}
                        </span>
                        , allocated at boot from{" "}
                        <span className="font-mono">CS2_MAXPLAYERS</span>.
                        Raising it needs{" "}
                        <span className="font-mono">
                          docker compose up -d --force-recreate cs2
                        </span>{" "}
                        on the host — the panel cannot do it.
                      </>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
