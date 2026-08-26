"use client";

import { ArrowsClockwise, WarningCircle } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Shown when a surface cannot load its data.
 *
 * Every page used to gate on `isPending || !data`, so a failed fetch rendered
 * its loading skeleton forever — indistinguishable from a slow server, and
 * offering nothing to do about it.
 */
export function LoadError({
  what,
  error,
  onRetry,
}: {
  /** What failed to load, as a noun phrase: "the roster", "match state". */
  what: string;
  error: unknown;
  onRetry?: () => void;
}) {
  const message =
    error instanceof Error ? error.message : error ? String(error) : "";

  return (
    <Alert variant="destructive">
      <WarningCircle />
      <AlertTitle>Could not load {what}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{message || "The server gave no reason."}</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <ArrowsClockwise className="h-4 w-4" />
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
