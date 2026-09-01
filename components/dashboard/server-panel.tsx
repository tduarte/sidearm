"use client";

/**
 * The server, as something you change rather than something you read.
 *
 * This card used to be two things in two places: a read-only hero on the
 * dashboard and a form on the Config page restating the same facts. So the
 * mode appeared twice, the map appeared twice, and noticing something wrong
 * meant navigating away to fix it. Here the value you are looking at is the
 * control — the map headline opens the map list — and `lib/dashboard/panel.ts`
 * holds the two rules that make that safe: nothing is sent until you save, and
 * the map goes last.
 *
 * Which rows exist depends on the mode. A round limit and overtime are the
 * machinery of a match that counts; on an aim map they are clutter around the
 * two things anyone came here to change.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowCounterClockwise, Clipboard, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { StatusPill } from "@/components/status-pill";
import { useCan } from "@/components/session-provider";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { api } from "@/lib/api/client";
import {
  changedKeys,
  fieldLabel,
  fieldsForMode,
  modeNeedsMapReload,
  planApply,
  type Draft,
  type FieldKey,
  type PanelValues,
} from "@/lib/dashboard/panel";
import type { GameMode, MatchState, ServerStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const MODES: { value: GameMode; label: string }[] = [
  { value: "competitive", label: "Competitive" },
  { value: "wingman", label: "Wingman" },
  { value: "casual", label: "Casual" },
  { value: "deathmatch", label: "Deathmatch" },
  { value: "practice", label: "Practice" },
  { value: "custom", label: "Custom" },
];

function formatUptime(s: number | null) {
  if (s === null) return "unknown";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

/** `null` = RCON has not answered; `false` is the dead-GSLT signature. */
function VacBadge({ secure }: { secure: boolean | null }) {
  if (secure === null) return null;
  return secure ? (
    <Badge variant="outline" className="border-ok/30 bg-ok/12 text-ok">
      VAC secure
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="border-danger/30 bg-danger/12 text-danger"
      title="The server is running but unlisted and unprotected — usually a dead or missing GSLT. Reissue it at steamcommunity.com/dev/managegameservers."
    >
      VAC insecure
    </Badge>
  );
}

/**
 * One editable line.
 *
 * The dot is the entire affordance for "this is staged". A touched row reads
 * differently from an untouched one without moving anything or changing the
 * row's height, so a panel mid-edit does not reflow under the hands of whoever
 * is editing it.
 */
function Row({
  label,
  hint,
  dirty,
  children,
}: {
  label: string;
  hint?: string;
  dirty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full bg-primary transition-opacity",
              dirty ? "opacity-100" : "opacity-0",
            )}
            aria-hidden={!dirty}
            aria-label={dirty ? "Changed, not yet saved" : undefined}
          />
          <span
            className={cn(
              "truncate",
              dirty ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </span>
        </div>
        {hint ? <p className="mt-0.5 pl-3 text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function ServerPanel({
  status,
  match,
}: {
  status: ServerStatus;
  match: MatchState | undefined;
}) {
  const canEdit = useCan("admin");
  const isNarrow = useMediaQuery("(max-width: 639px)");
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>({});

  const config = useQuery({ queryKey: ["config"], queryFn: () => api.getConfig() });
  const maps = useQuery({ queryKey: ["maps"], queryFn: () => api.getMaps() });

  /**
   * What the server says right now.
   *
   * Derived from the live queries every render rather than copied into state on
   * mount: a value someone else changed — or that MatchZy changed when a match
   * went live — has to show up here, and a stale local copy would quietly be
   * written back over theirs on the next save.
   */
  const current: PanelValues | null = useMemo(() => {
    if (!config.data) return null;
    return {
      hostname: status.hostname,
      map: status.map,
      mode: status.gameMode,
      serverPassword: config.data.access.serverPassword,
      botsEnabled: config.data.gameplay.botsEnabled,
      botQuota: config.data.gameplay.botQuota,
      botDifficulty: config.data.gameplay.botDifficulty,
      maxRounds: match?.maxRounds ?? null,
      overtime: match?.overtime ?? null,
    };
  }, [config.data, status, match]);

  const dirty = current ? changedKeys(current, draft) : [];
  const steps = current && config.data ? planApply(current, draft, config.data) : [];
  const needsReload = current ? modeNeedsMapReload(current, draft) : false;

  const save = useMutation({
    mutationFn: async () => {
      // Sequential on purpose: the order `planApply` returns is the point, and
      // a parallel burst of RCON writes is exactly the half-applied state this
      // staging model exists to prevent.
      for (const step of steps) {
        if (step.kind === "cvar") await api.setCvar(step.name, step.value);
        else if (step.kind === "config") await api.putConfig(step.config);
        else await api.changeMap(step.name);
      }
    },
    meta: { action: "Save" },
    onSuccess: () => {
      const changedMap = steps.some((s) => s.kind === "map");
      toast.success(`Applied ${steps.length} change${steps.length === 1 ? "" : "s"}`, {
        description: changedMap
          ? "A map the server has not cached downloads first — allow about a minute."
          : undefined,
      });
      setDraft({});
      qc.invalidateQueries({ queryKey: ["status"] });
      qc.invalidateQueries({ queryKey: ["config"] });
      qc.invalidateQueries({ queryKey: ["match"] });
    },
  });

  const shown = new Set<FieldKey>(
    fieldsForMode(draft.mode ?? current?.mode ?? status.gameMode),
  );
  const set = <K extends FieldKey>(key: K, value: PanelValues[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const has = (k: FieldKey) => dirty.includes(k);

  // A viewer or moderator reads the same values; they just cannot move them.
  // The config route is admin-only, so for them `current` never arrives and the
  // rows stay collapsed — the identity strip above still renders in full.
  const lock = !canEdit || save.isPending || !current;
  const mapList = maps.data?.all ?? [];

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill state={status.state} />
          <VacBadge secure={status.vacSecure} />
        </div>

        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0 shrink">
            <p className="truncate text-muted-foreground" title={status.hostname}>
              {status.hostname}
            </p>
            {/*
              The headline is the control. "What map are we on" is the most-asked
              question about a server, so it stays the largest type on the page —
              and clicking it is also how you change it, which is the whole point
              of folding Config in here.
            */}
            <Select
              value={draft.map ?? status.map}
              disabled={lock || maps.isPending}
              onValueChange={(v) => set("map", v)}
            >
              <SelectTrigger
                aria-label="Map"
                className={cn(
                  "w-auto max-w-full border-0 bg-transparent px-0 font-mono text-2xl font-semibold tracking-tight",
                  "data-[size=default]:h-auto dark:bg-transparent dark:hover:bg-transparent",
                  "disabled:cursor-default disabled:opacity-100",
                  has("map") && "text-primary",
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/*
                  The running map is always offered even when it is not in the
                  list. A workshop map the panel has not resolved yet would
                  otherwise leave the trigger blank and look broken.
                */}
                {mapList.some((m) => m.name === status.map) ? null : (
                  <SelectItem value={status.map}>{status.map}</SelectItem>
                )}
                {mapList.map((m) => (
                  <SelectItem key={m.name} value={m.name}>
                    {m.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex w-full min-w-0 justify-stretch sm:w-auto sm:shrink-0 sm:justify-end">
            <InputGroup className="h-9 w-full min-w-0 max-w-full sm:w-max">
              <InputGroupInput
                readOnly
                spellCheck={false}
                value={status.connectUrl}
                aria-label="Server connect URL"
                size={isNarrow ? undefined : Math.max(status.connectUrl.length, 12)}
                className={cn(
                  "font-mono text-foreground",
                  isNarrow
                    ? "!w-full min-w-0 flex-1 overflow-x-auto"
                    : "!w-auto !max-w-full !flex-none",
                )}
                onFocus={(e) => e.currentTarget.select()}
                onClick={(e) => e.currentTarget.select()}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-sm"
                  variant="ghost"
                  className="text-primary hover:bg-primary/15 hover:text-primary dark:hover:bg-primary/20"
                  aria-label="Copy connect URL"
                  onClick={() => {
                    navigator.clipboard.writeText(status.connectUrl);
                    toast.success("Connect URL copied");
                  }}
                >
                  <Clipboard className="size-4" />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </div>
        </div>

        <p className="text-muted-foreground">
          Uptime {formatUptime(status.uptimeSec)} · {status.ip}:{status.port}
        </p>
      </div>

      {current && (
        <div className="divide-y divide-foreground/10 border-t border-foreground/10 px-4">
          <Row label="Mode" dirty={has("mode")}>
            <Select
              value={draft.mode ?? current.mode}
              disabled={lock}
              onValueChange={(v) => set("mode", v as GameMode)}
            >
              <SelectTrigger className="w-40" aria-label="Game mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          {shown.has("maxRounds") && (
            <Row
              label="Round limit"
              hint={current.maxRounds === null ? "Not read yet" : undefined}
              dirty={has("maxRounds")}
            >
              <Input
                type="number"
                min={1}
                max={120}
                className="w-24"
                aria-label="Round limit"
                disabled={lock || current.maxRounds === null}
                value={draft.maxRounds ?? current.maxRounds ?? ""}
                onChange={(e) => set("maxRounds", Number(e.target.value))}
              />
            </Row>
          )}

          {shown.has("overtime") && (
            <Row
              label="Overtime"
              hint={current.overtime === null ? "Not read yet" : undefined}
              dirty={has("overtime")}
            >
              <Switch
                aria-label="Overtime"
                disabled={lock || current.overtime === null}
                checked={draft.overtime ?? current.overtime ?? false}
                onCheckedChange={(v) => set("overtime", v)}
              />
            </Row>
          )}

          <Row label="Bots" dirty={has("botsEnabled") || has("botQuota")}>
            <div className="flex items-center gap-2">
              {(draft.botsEnabled ?? current.botsEnabled) && (
                <Input
                  type="number"
                  min={0}
                  max={32}
                  className="w-16"
                  aria-label="Bot count"
                  disabled={lock}
                  value={draft.botQuota ?? current.botQuota}
                  onChange={(e) => set("botQuota", Number(e.target.value))}
                />
              )}
              <Switch
                aria-label="Bots"
                disabled={lock}
                checked={draft.botsEnabled ?? current.botsEnabled}
                onCheckedChange={(v) => set("botsEnabled", v)}
              />
            </div>
          </Row>

          <Row label="Server name" dirty={has("hostname")}>
            <Input
              className="w-56"
              aria-label="Server name"
              disabled={lock}
              value={draft.hostname ?? current.hostname}
              onChange={(e) => set("hostname", e.target.value)}
            />
          </Row>

          <Row label="Password" hint="Empty lets anyone join" dirty={has("serverPassword")}>
            <Input
              type="password"
              className="w-40"
              aria-label="Server password"
              placeholder="none"
              disabled={lock}
              value={draft.serverPassword ?? current.serverPassword}
              onChange={(e) => set("serverPassword", e.target.value)}
            />
          </Row>
        </div>
      )}

      {dirty.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-foreground/10 bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="font-medium">
              {dirty.length} unsaved change{dirty.length === 1 ? "" : "s"}
            </p>
            <p className="truncate text-muted-foreground">
              {dirty.map(fieldLabel).join(", ")}
            </p>
            {needsReload && (
              <p className="flex items-start gap-1.5 text-warn">
                <Warning className="mt-px size-3.5 shrink-0" weight="fill" />
                A mode change only takes hold when a map loads. Pick a map too, or
                this will look like it did nothing.
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={save.isPending}
              onClick={() => setDraft({})}
            >
              <ArrowCounterClockwise className="size-4" />
              Discard
            </Button>
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
