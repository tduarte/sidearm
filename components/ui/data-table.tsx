"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  getRowId?: (originalRow: TData, index: number) => string;
  emptyMessage?: string;
  emptyRowClassName?: string;
  className?: string;
  /** Omit thead (e.g. compact stat-card lists). */
  hideHeader?: boolean;
  rowClassName?: string;
  cellClassName?: string;
}

/**
 * Headless TanStack Table + shadcn `Table` primitives.
 * @see https://ui.shadcn.com/docs/components/radix/data-table
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  getRowId,
  emptyMessage = "No results.",
  emptyRowClassName = "h-24 text-center",
  className,
  hideHeader = false,
  rowClassName,
  cellClassName,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    ...(getRowId != null ? { getRowId } : {}),
  });

  return (
    <div
      className={cn("overflow-hidden rounded-none border", className)}
      data-slot="data-table"
    >
      <Table>
        {!hideHeader ? (
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="h-8 px-2 py-1.5">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
        ) : null}
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
                className={rowClassName}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn("px-2 py-1.5", cellClassName)}
                  >
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext(),
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className={rowClassName}>
              <TableCell
                colSpan={columns.length}
                className={cn(
                  "px-2 py-1.5",
                  cellClassName,
                  emptyRowClassName,
                  "text-muted-foreground",
                )}
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
