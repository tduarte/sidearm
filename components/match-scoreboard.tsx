"use client";

import type { Player } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** Mobile: name + K/A/D. sm+: #, name, K, A, D, ping. */
const scoreboardGridClass =
  "grid grid-cols-[minmax(0,1fr)_3rem_3rem_3rem] items-center gap-x-3 max-sm:gap-x-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_3rem_3rem_3rem_4.5rem] sm:gap-x-5";

function pingClass(ping: number) {
  if (ping > 150) return "text-red-400";
  if (ping > 100) return "text-amber-400";
  return "text-foreground";
}

function ColumnHeader() {
  return (
    <div
      className={cn(
        scoreboardGridClass,
        "border-b border-border py-2.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground",
      )}
    >
      <span className="hidden text-center sm:block">#</span>
      <span>Player</span>
      <span className="text-center">K</span>
      <span className="text-center">A</span>
      <span className="text-center">D</span>
      <span className="hidden text-right sm:block">Ping</span>
    </div>
  );
}

function PlayerRow({ player, index }: { player: Player; index: number }) {
  return (
    <li className={cn(scoreboardGridClass, "py-4")}>
      <div
        className="hidden size-10 items-center justify-center border border-border bg-muted text-xs font-medium text-muted-foreground tabular-nums sm:flex"
        aria-hidden
      >
        {index + 1}
      </div>
      <p className="min-w-0 truncate font-medium leading-tight">{player.name}</p>
      <span className="text-center text-sm tabular-nums text-foreground">
        {player.k}
      </span>
      <span className="text-center text-sm tabular-nums text-foreground">
        {player.a}
      </span>
      <span className="text-center text-sm tabular-nums text-foreground">
        {player.d}
      </span>
      <div
        className={cn(
          "hidden text-right text-sm font-medium tabular-nums sm:block",
          pingClass(player.ping),
        )}
      >
        {player.ping}
        <span className="text-xs font-normal text-muted-foreground"> ms</span>
      </div>
    </li>
  );
}

function TeamPanel({
  title,
  subtitle,
  accent,
  players,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  accent: "ct" | "t" | "spec";
  players: Player[];
  emptyLabel: string;
}) {
  const bar =
    accent === "ct"
      ? "border-t-2 border-t-blue-500/70"
      : accent === "t"
        ? "border-t-2 border-t-amber-500/70"
        : "border-t-2 border-t-zinc-500/50";

  const titleColor =
    accent === "ct"
      ? "text-blue-400"
      : accent === "t"
        ? "text-amber-400"
        : "text-zinc-400";

  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-none border border-border bg-card/40 ring-1 ring-foreground/5",
        bar,
      )}
    >
      <div className="border-b border-border/80 px-4 py-3">
        <h4 className={cn("font-heading text-sm font-medium", titleColor)}>
          {title}
        </h4>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {players.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <div className="px-4 pb-1">
          <ColumnHeader />
          <ul className="divide-y divide-border" role="list">
            {players.map((p, i) => (
              <PlayerRow key={p.steamId} player={p} index={i} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function MatchScoreboard({ players }: { players: Player[] }) {
  const byKd = (a: Player, b: Player) => b.k - a.k || b.a - a.a;
  const ct = players.filter((p) => p.team === "CT").sort(byKd);
  const t = players.filter((p) => p.team === "T").sort(byKd);
  const spec = players.filter((p) => p.team === "SPEC").sort(byKd);

  if (players.length === 0) {
    return (
      <div className="rounded-none border border-dashed border-border px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">No players connected.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <TeamPanel
          title="Counter-Terrorists"
          subtitle={`${ct.length} in roster`}
          accent="ct"
          players={ct}
          emptyLabel="No CT players"
        />
        <TeamPanel
          title="Terrorists"
          subtitle={`${t.length} in roster`}
          accent="t"
          players={t}
          emptyLabel="No T players"
        />
      </div>

      {spec.length > 0 && (
        <TeamPanel
          title="Spectators"
          subtitle={`${spec.length} watching`}
          accent="spec"
          players={spec}
          emptyLabel=""
        />
      )}
    </div>
  );
}
