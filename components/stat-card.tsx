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
    <Card className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-4">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
          </div>
          {icon && (
            <div className="shrink-0 text-muted-foreground/80">{icon}</div>
          )}
        </div>
        {sub ? (
          <div className="flex min-h-0 w-full flex-1 flex-col text-xs text-muted-foreground [&>*]:min-h-0 [&>*]:flex-1">
            {sub}
          </div>
        ) : (
          <div className="min-h-0 flex-1" aria-hidden />
        )}
      </CardContent>
    </Card>
  );
}
