"use client";

/**
 * The server's own configuration — what is left of it.
 *
 * This was the `/config` page. Almost everything it used to hold moved to the
 * dashboard, where the value you are looking at is the one you change: the
 * mode, the bots, the name and the password are all staged in the band now.
 * What could not move is here, because it is not a thing you edit mid-match:
 *
 *  - **Presets**, which are how you say "we're playing Wingman tonight" once
 *    instead of setting six fields. The dashboard has its own preset list for
 *    the live half; this one carries the `why` prose and the boot tier, which
 *    are setup-time reading rather than mid-match controls.
 *  - **The slot ceiling**, which the panel genuinely cannot change from inside
 *    the compose project, so the card prints the `.env` lines and the one
 *    command rather than a button that would appear to work and not.
 *
 * The preset here fills in the advertised slot count and nothing else. Setting
 * the mode and the bots from two pages would be two writers for one setting,
 * and the loser would be whichever page was saved second.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { FloppyDisk } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  gameplay: z.object({
    visibleMaxPlayers: z.coerce.number().min(1).max(64),
  }),
});

type FormValues = z.infer<typeof schema>;

export function ServerCard() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["config"],
    queryFn: () => api.getConfig(),
  });

  if (error && !data) {
    return (
      <LoadError what="the server config" error={error} onRetry={() => refetch()} />
    );
  }

  if (isPending || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return <ServerForm config={data} />;
}

function ServerForm({ config }: { config: ServerConfig }) {
  const qc = useQueryClient();
  const { data: status } = useServerStatus();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: {
      gameplay: { visibleMaxPlayers: config.gameplay.visibleMaxPlayers },
    },
  });

  const save = useMutation({
    /*
     * Spread over the config the query last returned rather than over the form.
     * The form only owns one field now; sending the form's shape would blank
     * the hostname, the password, the mode and the bots — every one of which is
     * written from the dashboard, by someone who is very likely not this
     * browser.
     */
    mutationFn: (v: FormValues) =>
      api.putConfig({
        ...config,
        gameplay: {
          ...config.gameplay,
          visibleMaxPlayers: v.gameplay.visibleMaxPlayers,
        },
      }),
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
          <CardContent className="space-y-4">
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
            <Button
              type="submit"
              disabled={!form.formState.isDirty || save.isPending}
            >
              <FloppyDisk className="h-4 w-4" />
              Save changes
            </Button>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
