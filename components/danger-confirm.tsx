"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import { useMatchState } from "@/lib/hooks/use-match-state";

/**
 * Confirmation for an action that costs the people on the server something.
 *
 * Two rules make this worth having rather than being friction:
 *
 *  - It states the blast radius with live numbers — how many are connected and
 *    where the match is — read at the moment of asking, not written into copy.
 *  - It only asks when there is something to lose. With an empty server a
 *    restart harms nobody, so the action just runs. A dialog that always
 *    appears is one people learn to dismiss without reading.
 *
 * The operation string continues the panel's existing habit of showing the
 * command it is about to run, the way the match tiles print `mp_restartgame 1`.
 */
export function DangerConfirm({
  title,
  consequence,
  operation,
  confirmLabel,
  onConfirm,
  children,
}: {
  title: string;
  /** What happens to the people currently connected. */
  consequence: string;
  /** The exact command this runs, e.g. `docker restart cs2`. */
  operation: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** Renders the trigger. Call `arm()` from its click handler. */
  children: (arm: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { data: status } = useServerStatus();
  const { data: match } = useMatchState();

  const connected = status?.players ?? 0;

  const arm = () => {
    // Nobody to disturb — don't make the admin confirm into an empty room.
    if (connected === 0) {
      onConfirm();
      return;
    }
    setOpen(true);
  };

  const matchLine =
    match && match.phase !== "idle"
      ? `Round ${match.round}${
          match.maxRounds ? ` of ${match.maxRounds}` : ""
        } · CT ${match.score.ct} – ${match.score.t} T`
      : null;

  return (
    <>
      {children(arm)}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="font-medium text-foreground">
                  {connected} player{connected === 1 ? "" : "s"} connected
                  {matchLine ? ` · ${matchLine}` : ""}
                </p>
                <p>{consequence}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {operation}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
