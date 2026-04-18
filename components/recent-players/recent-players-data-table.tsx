"use client";

import { useEffect, useMemo, useState } from "react";

import type { Player } from "@/lib/api/types";
import { DataTable } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getRecentPlayerColumns } from "./columns";

const REFRESH_MS = 10_000;

/** Horizontal rules between rows (default `TableRow` `border-b`); subtle hover. */
const rowVisual = cn(
  "border-border/55",
  "hover:bg-muted/25",
  "data-[state=selected]:bg-transparent",
);

const cellVisual = cn("px-3 py-3.5", "align-middle");

function recentFirst(players: Player[], max: number): Player[] {
  return [...players]
    .sort(
      (a, b) =>
        new Date(b.connectedAt).getTime() - new Date(a.connectedAt).getTime(),
    )
    .slice(0, max);
}

export function RecentPlayersDataTable({
  players,
  loading,
  max = 4,
}: {
  players: Player[] | undefined;
  loading: boolean;
  max?: number;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const columns = useMemo(() => getRecentPlayerColumns(nowMs), [nowMs]);

  const data = useMemo(
    () => (players?.length ? recentFirst(players, max) : []),
    [players, max],
  );

  if (loading && players === undefined) {
    return (
      <div className="overflow-hidden" aria-busy="true" aria-label="Loading recent players">
        <Table>
          <TableBody>
            {Array.from({ length: max }).map((_, i) => (
              <TableRow key={i} className={rowVisual}>
                <TableCell className={cellVisual}>
                  <Skeleton className="h-3.5 w-full max-w-[9rem] rounded" />
                </TableCell>
                <TableCell className={cn(cellVisual, "text-right")}>
                  <Skeleton className="ml-auto h-3.5 w-14 rounded" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <DataTable
      className="border-0 shadow-none"
      columns={columns}
      data={data}
      getRowId={(row) => row.steamId}
      emptyMessage="No players connected."
      emptyRowClassName="h-16 text-center text-xs"
      hideHeader
      rowClassName={rowVisual}
      cellClassName={cellVisual}
    />
  );
}
