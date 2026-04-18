"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

const CPU_CHART_CONFIG = {
  cpu: {
    label: "CPU",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const FPS_CHART_CONFIG = {
  fps: {
    label: "FPS",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

/** Avoid Recharts default `#ccc` — `ChartContainer` maps that to `border/50`, which is hard to see on dark UI. */
const GRID_STROKE = "var(--border)";
const GRID_STROKE_OPACITY = 0.82;

/** Benchmarks only (not 0/180/300); spacing follows Y domain from `fpsDomain`. */
const FPS_BENCHMARK_LINES = [60, 120, 240] as const;

export function Sparkline({
  data,
  className,
  stroke = "var(--primary)",
  variant = "default",
}: {
  data: number[];
  className?: string;
  stroke?: string;
  variant?: "default" | "cpu" | "fps";
}) {
  const defaultChartConfig = useMemo(
    () =>
      ({
        value: {
          label: "Value",
          color: stroke,
        },
      }) satisfies ChartConfig,
    [stroke],
  );

  const chartConfig =
    variant === "cpu"
      ? CPU_CHART_CONFIG
      : variant === "fps"
        ? FPS_CHART_CONFIG
        : defaultChartConfig;

  const chartData: Array<Record<string, number>> = useMemo(() => {
    if (variant === "cpu") {
      return data.map((value, i) => ({ i, cpu: value }));
    }
    if (variant === "fps") {
      return data.map((value, i) => ({ i, fps: value }));
    }
    return data.map((value, i) => ({ i, value }));
  }, [data, variant]);

  const dataKey =
    variant === "cpu" ? "cpu" : variant === "fps" ? "fps" : "value";

  const fpsDomain = useMemo((): [number, number] => {
    const maxVal = data.length > 0 ? Math.max(...data) : 0;
    const yMax = Math.max(300, Math.ceil(Math.max(maxVal, 240) / 60) * 60);
    return [0, yMax];
  }, [data]);

  /** Recharts 3: `CartesianGrid` derives lines from axis ticks; use `horizontalValues` so lines sit on real data units (see CartesianGrid.d.ts). */
  const cpuHorizontalValues = useMemo(
    () => [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    [],
  );

  const heightClass =
    variant === "default"
      ? "h-11 shrink-0"
      : "min-h-24 h-full flex-1 items-stretch";

  return (
    <ChartContainer
      config={chartConfig}
      initialDimension={{ width: 320, height: variant === "default" ? 44 : 96 }}
      className={cn(
        "!aspect-auto min-h-0 w-full min-w-0",
        heightClass,
        className,
      )}
    >
      <AreaChart
        accessibilityLayer
        data={chartData}
        margin={{ left: 12, right: 12, top: 4, bottom: 4 }}
      >
        <XAxis
          dataKey="i"
          type="number"
          hide
          tickLine={false}
          axisLine={false}
        />
        {variant === "cpu" && (
          <>
            <YAxis
              yAxisId="main"
              type="number"
              domain={[0, 100]}
              ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
              width={0}
              hide
              allowDataOverflow
            />
            <CartesianGrid
              yAxisId="main"
              vertical={false}
              horizontalValues={cpuHorizontalValues}
              stroke={GRID_STROKE}
              strokeOpacity={GRID_STROKE_OPACITY}
            />
          </>
        )}
        {variant === "fps" && (
          <>
            <YAxis
              yAxisId="main"
              type="number"
              domain={fpsDomain}
              width={0}
              hide
              allowDataOverflow
            />
            <CartesianGrid
              yAxisId="main"
              vertical={false}
              horizontalValues={[...FPS_BENCHMARK_LINES]}
              stroke={GRID_STROKE}
              strokeOpacity={GRID_STROKE_OPACITY}
              strokeDasharray="4 4"
            />
          </>
        )}
        {variant === "default" && <CartesianGrid vertical={false} />}
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="line"
              formatter={(value) =>
                variant === "cpu"
                  ? `${Number(value).toFixed(0)}%`
                  : variant === "fps"
                    ? `${Number(value).toFixed(0)}`
                    : String(value)
              }
            />
          }
        />
        <Area
          yAxisId={variant === "default" ? undefined : "main"}
          dataKey={dataKey}
          type="natural"
          fill={`var(--color-${dataKey})`}
          fillOpacity={0.4}
          stroke={`var(--color-${dataKey})`}
          strokeWidth={1.5}
          baseValue={variant === "cpu" || variant === "fps" ? 0 : undefined}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
