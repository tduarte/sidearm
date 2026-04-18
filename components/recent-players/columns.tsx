"use client";

import type { ColumnDef } from "@tanstack/react-table";

import type { Player } from "@/lib/api/types";
import { formatShortTimeAgo } from "@/lib/format-short-time-ago";

export function getRecentPlayerColumns(nowMs: number): ColumnDef<Player>[] {
  return [
    {
      accessorKey: "name",
      header: "Player",
      cell: ({ row }) => (
        <span
          className="block max-w-[11rem] truncate font-medium text-foreground/90"
          title={row.original.name}
        >
          {row.original.name}
        </span>
      ),
    },
    {
      id: "connected",
      accessorFn: (row) => row.connectedAt,
      header: "Connected",
      cell: ({ row }) => (
        <div className="text-right tabular-nums text-muted-foreground">
          {formatShortTimeAgo(row.original.connectedAt, nowMs)}
        </div>
      ),
    },
  ];
}
