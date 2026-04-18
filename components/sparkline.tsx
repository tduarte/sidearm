"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

export function Sparkline({
  data,
  className,
  stroke = "hsl(var(--primary))",
}: {
  data: number[];
  className?: string;
  stroke?: string;
}) {
  const chartData = data.map((value, i) => ({ i, value }));
  return (
    <div className={cn("h-12 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.4} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={1.5}
            fill="url(#spark)"
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
