"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { FloppyDisk } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api/client";
import type { ServerConfig } from "@/lib/api/types";

const schema = z.object({
  identity: z.object({
    hostname: z.string().min(1).max(128),
    tagsInput: z.string(),
    region: z.enum(["us-east", "us-west", "eu-west", "ap-southeast", "sa-east"]),
  }),
  access: z.object({
    serverPassword: z.string(),
    rconPassword: z.string().min(6, "RCON password must be at least 6 chars"),
    gsltToken: z.string(),
  }),
  gameplay: z.object({
    mode: z.enum(["competitive", "wingman", "deathmatch", "casual", "practice", "custom"]),
    tickrate: z.enum(["64", "128"]),
    maxPlayers: z.coerce.number().min(2).max(64),
    botsEnabled: z.boolean(),
    botDifficulty: z.enum(["0", "1", "2", "3"]),
    botQuota: z.coerce.number().min(0).max(32),
  }),
  networking: z.object({
    port: z.coerce.number().min(1024).max(65535),
    tvPort: z.coerce.number().min(1024).max(65535),
    workshopCollectionId: z.string(),
  }),
});

type FormValues = z.infer<typeof schema>;

function toForm(c: ServerConfig): FormValues {
  return {
    identity: {
      hostname: c.identity.hostname,
      tagsInput: c.identity.tags.join(", "),
      region: c.identity.region as FormValues["identity"]["region"],
    },
    access: { ...c.access },
    gameplay: {
      mode: c.gameplay.mode,
      tickrate: String(c.gameplay.tickrate) as "64" | "128",
      maxPlayers: c.gameplay.maxPlayers,
      botsEnabled: c.gameplay.botsEnabled,
      botDifficulty: String(c.gameplay.botDifficulty) as "0" | "1" | "2" | "3",
      botQuota: c.gameplay.botQuota,
    },
    networking: { ...c.networking },
  };
}

function fromForm(v: FormValues): ServerConfig {
  return {
    identity: {
      hostname: v.identity.hostname,
      tags: v.identity.tagsInput.split(",").map((s) => s.trim()).filter(Boolean),
      region: v.identity.region,
    },
    access: v.access,
    gameplay: {
      mode: v.gameplay.mode,
      tickrate: Number(v.gameplay.tickrate) as 64 | 128,
      maxPlayers: v.gameplay.maxPlayers,
      botsEnabled: v.gameplay.botsEnabled,
      botDifficulty: Number(v.gameplay.botDifficulty) as 0 | 1 | 2 | 3,
      botQuota: v.gameplay.botQuota,
    },
    networking: v.networking,
  };
}

export default function ConfigPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["config"],
    queryFn: () => api.getConfig(),
  });

  if (isLoading || !data) {
    return <Skeleton className="h-96" />;
  }

  return <ConfigForm initial={toForm(data)} />;
}

function ConfigForm({ initial }: { initial: FormValues }) {
  const qc = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: initial,
  });

  const save = useMutation({
    mutationFn: (v: FormValues) => api.putConfig(fromForm(v)),
    onSuccess: () => {
      toast.success("Config saved");
      qc.invalidateQueries({ queryKey: ["config"] });
      qc.invalidateQueries({ queryKey: ["status"] });
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Config</h1>
            <p className="text-sm text-muted-foreground">
              Changes take effect on next server restart.
            </p>
          </div>
          <Button
            type="submit"
            disabled={save.isPending || !form.formState.isDirty}
          >
            <FloppyDisk className="h-4 w-4" />
            Save changes
          </Button>
        </div>

        <Tabs defaultValue="identity">
          <TabsList>
            <TabsTrigger value="identity">Identity</TabsTrigger>
            <TabsTrigger value="access">Access</TabsTrigger>
            <TabsTrigger value="gameplay">Gameplay</TabsTrigger>
            <TabsTrigger value="networking">Networking</TabsTrigger>
          </TabsList>

          <TabsContent value="identity" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Server identity</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="identity.hostname"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Hostname</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormDescription>Displayed in the server browser.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="identity.tagsInput"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags</FormLabel>
                      <FormControl><Input placeholder="comma, separated" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="identity.region"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Region</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="us-east">US East</SelectItem>
                          <SelectItem value="us-west">US West</SelectItem>
                          <SelectItem value="eu-west">EU West</SelectItem>
                          <SelectItem value="ap-southeast">AP Southeast</SelectItem>
                          <SelectItem value="sa-east">SA East</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="access" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Access</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="access.serverPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Server password</FormLabel>
                      <FormControl><Input type="password" placeholder="(empty = public)" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="access.rconPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>RCON password</FormLabel>
                      <FormControl><Input type="password" {...field} /></FormControl>
                      <FormDescription>Required for remote admin commands.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="access.gsltToken"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>GSLT token</FormLabel>
                      <FormControl><Input placeholder="optional" {...field} /></FormControl>
                      <FormDescription>Game Server Login Token from Steam.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gameplay" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Gameplay</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="gameplay.mode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Game mode</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="competitive">Competitive</SelectItem>
                          <SelectItem value="wingman">Wingman</SelectItem>
                          <SelectItem value="deathmatch">Deathmatch</SelectItem>
                          <SelectItem value="casual">Casual</SelectItem>
                          <SelectItem value="practice">Practice</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gameplay.tickrate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tickrate</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="64">64 tick</SelectItem>
                          <SelectItem value="128">128 tick</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gameplay.maxPlayers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max players</FormLabel>
                      <FormControl><Input type="number" min={2} max={64} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gameplay.botsEnabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <FormLabel>Bots enabled</FormLabel>
                        <FormDescription>Fill empty slots with AI bots.</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gameplay.botDifficulty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bot difficulty</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="0">Easy</SelectItem>
                          <SelectItem value="1">Normal</SelectItem>
                          <SelectItem value="2">Hard</SelectItem>
                          <SelectItem value="3">Expert</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gameplay.botQuota"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bot quota</FormLabel>
                      <FormControl><Input type="number" min={0} max={32} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="networking" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Networking</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="networking.port"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Game port</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="networking.tvPort"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GOTV port</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="networking.workshopCollectionId"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Workshop collection ID</FormLabel>
                      <FormControl><Input placeholder="optional" {...field} /></FormControl>
                      <FormDescription>
                        All maps in this collection become available on the server.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </form>
    </Form>
  );
}
