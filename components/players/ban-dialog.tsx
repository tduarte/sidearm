"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDuration } from "@/lib/cs2/bans";
import type { Player } from "@/lib/api/types";

/** Offered lengths. `null` is a real option, not the absence of one. */
const DURATIONS: { value: string; minutes: number | null }[] = [
  { value: "15", minutes: 15 },
  { value: "60", minutes: 60 },
  { value: "1440", minutes: 60 * 24 },
  { value: "10080", minutes: 60 * 24 * 7 },
  { value: "never", minutes: null },
];

export function BanDialog({
  player,
  onOpenChange,
  onConfirm,
  pending,
}: {
  player: Player | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (minutes: number | null, reason: string) => void;
  pending: boolean;
}) {
  const [duration, setDuration] = useState("60");
  const [reason, setReason] = useState("");

  const minutes = DURATIONS.find((d) => d.value === duration)?.minutes ?? 60;

  return (
    <AlertDialog open={!!player} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ban {player?.name}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                They are removed now and cannot rejoin until the ban lifts.
              </p>
              {player && (
                <p className="font-mono text-xs text-muted-foreground">
                  {player.steamId}
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ban-duration">Length</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger id="ban-duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {formatDuration(d.minutes)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ban-reason">Reason (optional)</Label>
            <Input
              id="ban-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Recorded by the panel, not shown to the player"
            />
          </div>

          {/*
            Saying this up front matters: the game server holds bans in memory
            and forgets them when the container restarts. The panel re-applies
            them on reconnect, which is the only reason the length above means
            anything.
          */}
          <p className="text-xs text-muted-foreground">
            The panel keeps the clock and lifts the ban when it expires. CS2
            itself forgets bans when the container restarts, so the panel
            re-applies them once it reconnects.
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => onConfirm(minutes, reason)}
          >
            Ban for {formatDuration(minutes)}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
