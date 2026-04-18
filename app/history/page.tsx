"use client";

import { useMemo, useState } from "react";
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
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

function formatDuration(startIso: string, endIso: string) {
  const mins = Math.round(
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000,
  );
  return `${mins} min`;
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
          Stored chat and match history (mock persistence).
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
              {matches.isLoading ? (
                <Skeleton className="h-64" />
              ) : (
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
                      <TableRow key={m.id}>
                        <TableCell className="text-muted-foreground">
                          {new Date(m.startedAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono">{m.map}</TableCell>
                        <TableCell className="capitalize">{m.gameMode}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className="text-blue-400">{m.finalScore.ct}</span>
                          <span className="text-muted-foreground"> : </span>
                          <span className="text-amber-400">{m.finalScore.t}</span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "gap-1.5",
                              m.winner === "CT" && "text-blue-400 border-blue-500/40",
                              m.winner === "T" && "text-amber-400 border-amber-500/40",
                              m.winner === "DRAW" && "text-muted-foreground",
                            )}
                          >
                            <Trophy className="h-3 w-3" />
                            {m.winner}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatDuration(m.startedAt, m.endedAt)}
                        </TableCell>
                        <TableCell className="text-right">{m.playerCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                <Skeleton className="h-64" />
              ) : filteredChat.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No chat messages match.
                </p>
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
                            m.team === "CT" && "text-blue-400 border-blue-500/40",
                            m.team === "T" && "text-amber-400 border-amber-500/40",
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
