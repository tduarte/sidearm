"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MagnifyingGlass, Trophy } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadError } from "@/components/load-error";
import { RoundTimeline } from "@/components/history/round-timeline";
import { MatchZyScoreboard } from "@/components/history/matchzy-scoreboard";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

function formatDuration(startIso: string, endIso: string) {
  const mins = Math.round(
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000,
  );
  return `${mins} min`;
}

type Match = Awaited<ReturnType<typeof api.getHistory>>[number];

/**
 * MatchZy tracks teams, which swap sides at half, so its scores are per-team
 * and cannot be coloured CT/blue and T/orange the way the log parser's are.
 */
function MatchScore({ m }: { m: Match }) {
  if (m.teams) {
    return (
      <span className="whitespace-nowrap tabular-nums">
        {m.teams[0].score}
        <span className="text-muted-foreground"> : </span>
        {m.teams[1].score}
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="text-team-ct">{m.finalScore.ct}</span>
      <span className="text-muted-foreground"> : </span>
      <span className="text-team-t">{m.finalScore.t}</span>
    </span>
  );
}

function WinnerBadge({ m }: { m: Match }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5",
        !m.teams && m.winner === "CT" && "text-team-ct border-team-ct/40",
        !m.teams && m.winner === "T" && "text-team-t border-team-t/40",
        (m.winner === "DRAW" || m.winnerLabel === "") && "text-muted-foreground",
      )}
    >
      <Trophy className="h-3 w-3" />
      {m.teams ? m.winnerLabel || "DRAW" : m.winner}
    </Badge>
  );
}

function NoMatches() {
  return (
    <div className="space-y-1 py-10 text-center text-sm text-muted-foreground">
      <p>No completed matches yet.</p>
      <p className="text-xs">A match is recorded once it reaches Game Over.</p>
    </div>
  );
}

export default function HistoryPage() {
  const matches = useQuery({
    queryKey: ["history"],
    queryFn: () => api.getHistory(),
  });
  const chat = useQuery({
    queryKey: ["chat"],
    queryFn: () => api.getChat(),
  });
  const [search, setSearch] = useState("");

  const filteredChat = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return chat.data ?? [];
    return (chat.data ?? []).filter(
      (m) =>
        m.message.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q),
    );
  }, [chat.data, search]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">History</h1>
        <p className="text-sm text-muted-foreground">
          Chat and completed matches. Where MatchZy ran the match, its own
          record is shown — real teams, real scores and a full scoreboard.
        </p>
      </div>

      <Tabs defaultValue="matches">
        <TabsList>
          <TabsTrigger value="matches">Matches</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
        </TabsList>

        <TabsContent value="matches" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Match history</CardTitle>
            </CardHeader>
            <CardContent>
              {matches.error ? (
                <LoadError
                  what="match history"
                  error={matches.error}
                  onRetry={() => matches.refetch()}
                />
              ) : matches.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="ml-auto h-4 w-16" />
                      <Skeleton className="h-6 w-20" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {(matches.data ?? []).length === 0 ? (
                    <NoMatches />
                  ) : (
                    <>
                      {/*
                        Seven columns do not survive a phone. Under `md` each
                        match becomes a card that leads with the two things you
                        scan for — the map and the score — and demotes the rest
                        to a single meta line.
                      */}
                      <ul className="space-y-4 md:hidden">
                        {(matches.data ?? []).map((m) => (
                          <li key={m.id} className="space-y-3 border-b pb-4 last:border-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-mono font-medium">{m.map}</p>
                                {m.teams && (
                                  <p className="truncate text-xs text-muted-foreground">
                                    {m.teams[0].name} vs {m.teams[1].name}
                                  </p>
                                )}
                              </div>
                              <p className="shrink-0 text-lg font-semibold">
                                <MatchScore m={m} />
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                              <WinnerBadge m={m} />
                              <span className="capitalize">{m.gameMode}</span>
                              <span>·</span>
                              <span>{formatDuration(m.startedAt, m.endedAt)}</span>
                              <span>·</span>
                              <span>{m.playerCount} players</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(m.startedAt).toLocaleString()}
                            </p>
                            {m.rounds && m.rounds.length > 0 && (
                              <RoundTimeline rounds={m.rounds} />
                            )}
                            {m.matchzyPlayers && m.matchzyPlayers.length > 0 && (
                              <MatchZyScoreboard players={m.matchzyPlayers} />
                            )}
                          </li>
                        ))}
                      </ul>

                      <div className="hidden md:block">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>When</TableHead>
                              <TableHead>Map</TableHead>
                              <TableHead>Mode</TableHead>
                              <TableHead className="text-right">Score</TableHead>
                              <TableHead>Winner</TableHead>
                              <TableHead className="text-right">Duration</TableHead>
                              <TableHead className="text-right">Players</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(matches.data ?? []).map((m) => (
                              <Fragment key={m.id}>
                                <TableRow>
                                  <TableCell className="text-muted-foreground">
                                    {new Date(m.startedAt).toLocaleString()}
                                  </TableCell>
                                  <TableCell className="font-mono">
                                    <span>{m.map}</span>
                                    {m.teams && (
                                      <span className="ml-2 font-sans text-xs text-muted-foreground">
                                        {m.teams[0].name} vs {m.teams[1].name}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="capitalize">{m.gameMode}</TableCell>
                                  <TableCell className="text-right">
                                    <MatchScore m={m} />
                                  </TableCell>
                                  <TableCell>
                                    <WinnerBadge m={m} />
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatDuration(m.startedAt, m.endedAt)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {m.playerCount}
                                  </TableCell>
                                </TableRow>
                                {m.rounds && m.rounds.length > 0 && (
                                  <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={7} className="pt-0">
                                      <RoundTimeline rounds={m.rounds} />
                                    </TableCell>
                                  </TableRow>
                                )}
                                {m.matchzyPlayers && m.matchzyPlayers.length > 0 && (
                                  <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={7} className="pt-0">
                                      <MatchZyScoreboard players={m.matchzyPlayers} />
                                    </TableCell>
                                  </TableRow>
                                )}
                              </Fragment>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-base">Chat log</CardTitle>
              <div className="relative max-w-xs">
                <MagnifyingGlass className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search chat…"
                  className="pl-8 h-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent>
              {chat.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="ml-auto h-4 w-16" />
                      <Skeleton className="h-6 w-20" />
                    </div>
                  ))}
                </div>
              ) : filteredChat.length === 0 ? (
                <div className="space-y-1 py-8 text-center text-sm text-muted-foreground">
                  {search ? (
                    <>
                      <p>No message matches \u201C{search}\u201D.</p>
                      <p className="text-xs">
                        {chat.data?.length ?? 0} message
                        {(chat.data?.length ?? 0) === 1 ? "" : "s"} logged.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>Nothing has been said yet.</p>
                      <p className="text-xs">
                        In-game chat is recorded here as it happens.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredChat
                    .slice()
                    .reverse()
                    .map((m) => (
                      <div
                        key={m.id}
                        className="flex items-baseline gap-3 py-2 text-sm"
                      >
                        <span className="shrink-0 font-mono text-xs text-muted-foreground/70">
                          {new Date(m.ts).toLocaleTimeString()}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0",
                            m.team === "CT" && "text-team-ct border-team-ct/40",
                            m.team === "T" && "text-team-t border-team-t/40",
                          )}
                        >
                          {m.team}
                        </Badge>
                        <span className="font-medium">{m.name}</span>
                        <span className="text-muted-foreground">:</span>
                        <span className="break-all">{m.message}</span>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
