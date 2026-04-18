"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
          </div>
          {icon && (
            <div className="text-muted-foreground/80">{icon}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
