"use client";

import * as React from "react";
import { Pie, PieChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Same shape as shadcn “Pie Chart - Donut”: `fill` on each row + `chartConfig` keys for `--color-*` and tooltips. */
const chartConfig = {
  used: {
    label: "Used",
    color: "var(--chart-1)",
  },
  free: {
    label: "Free",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

export function MemoryStatCard({
  memMb,
  memMaxMb,
  icon,
  className,
}: {
  memMb: number;
  memMaxMb: number;
  icon?: React.ReactNode;
  className?: string;
}) {
  const usedMb = Math.min(Math.max(memMb, 0), memMaxMb);
  const freeMb = Math.max(0, memMaxMb - usedMb);
  const memPct =
    memMaxMb > 0 ? Math.round((usedMb / memMaxMb) * 100) : 0;
  const usedGb = (usedMb / 1024).toFixed(1);
  const maxGbLabel = (memMaxMb / 1024).toFixed(0);

  const chartData = React.useMemo(
    () => [
      {
        segment: "used" as const,
        mb: usedMb,
        fill: "var(--color-used)",
      },
      {
        segment: "free" as const,
        mb: freeMb,
        fill: "var(--color-free)",
      },
    ],
    [usedMb, freeMb],
  );

  if (memMaxMb <= 0) {
    return (
      <Card
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden",
          className,
        )}
      >
        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Memory
            </p>
            {icon}
          </div>
          <p className="text-sm text-muted-foreground">No memory data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden",
        className,
      )}
    >
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Memory
          </p>
          {icon && (
            <div className="shrink-0 text-muted-foreground/80">{icon}</div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-center gap-1 sm:hidden">
          <p className="text-2xl font-semibold tabular-nums leading-none tracking-tight text-foreground">
            {usedGb} GB
          </p>
          <p className="text-xs leading-snug text-muted-foreground">
            {memPct}% of {maxGbLabel} GB
          </p>
        </div>

        <div className="relative mx-auto hidden w-full max-w-[220px] sm:block">
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square max-h-[200px] w-full justify-center [&_.recharts-pie]:outline-none"
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, name, item) => {
                      const mb =
                        typeof value === "number" ? value : Number(value);
                      const indicatorColor =
                        (typeof item.color === "string" && item.color) ||
                        (item.payload as { fill?: string })?.fill;
                      const segment =
                        name === "used" || name === "free" ? name : "used";
                      const rowLabel = chartConfig[segment].label;
                      return (
                        <>
                          <div
                            className="h-2.5 w-2.5 shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)"
                            style={
                              {
                                "--color-bg": indicatorColor,
                                "--color-border": indicatorColor,
                              } as React.CSSProperties
                            }
                          />
                          <div className="flex flex-1 justify-between gap-4 leading-none">
                            <span className="text-muted-foreground">
                              {rowLabel}
                            </span>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {(mb / 1024).toFixed(2)} GB
                            </span>
                          </div>
                        </>
                      );
                    }}
                  />
                }
              />
              <Pie
                data={chartData}
                dataKey="mb"
                nameKey="segment"
                innerRadius={60}
              />
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center">
            <p className="text-2xl font-semibold tabular-nums leading-none tracking-tight text-foreground">
              {usedGb} GB
            </p>
            <p className="text-xs leading-snug text-muted-foreground">
              {memPct}% of {maxGbLabel} GB
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
