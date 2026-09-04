"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api/client";

/**
 * The four things every surface in the panel can do to a running server.
 *
 * Pause, kick, change map and restart existed twice — once in the mobile
 * action bar, once in the ⌘K palette — with different wording and, worse,
 * different `invalidateQueries` sets. A map changed from the palette left the
 * map list stale while the same change from the bar refreshed it, so which
 * button you pressed decided whether the rest of the UI noticed. That is the
 * kind of divergence nobody finds by reading: it looks like a caching bug
 * weeks later.
 *
 * One definition, so the message and the refresh are properties of the
 * *action* rather than of the button. Anything genuinely surface-specific —
 * closing a sheet, clearing an armed confirmation — goes through `onDone`.
 *
 * Not included: anything staged. The dashboard's Apply is a plan of several
 * steps in a deliberate order (`lib/dashboard/panel.ts`), which is a different
 * kind of thing from a single button that fires now.
 */
export function useServerActions({ onDone }: { onDone?: () => void } = {}) {
  const qc = useQueryClient();
  const done = () => onDone?.();

  const pause = useMutation({
    mutationFn: (action: "pause" | "unpause") => api.setPause(action),
    meta: { action: "Pause" },
    onSuccess: (next) => {
      // CS2 applies `mp_pause_match` at the end of the round, so the honest
      // report is what was asked for, not what is true yet.
      toast.success(
        next.pause === "pause_requested"
          ? "Pause requested — it lands at the end of this round"
          : next.pause === "paused"
            ? "Match paused"
            : "Match resumed",
      );
      qc.invalidateQueries({ queryKey: ["match"] });
      done();
    },
  });

  const kick = useMutation({
    mutationFn: (steamId: string) => api.kick(steamId),
    meta: { action: "Kick" },
    onSuccess: () => {
      toast.success("Player kicked");
      // `status` carries the player count, so it goes stale with the roster.
      qc.invalidateQueries({ queryKey: ["players"] });
      qc.invalidateQueries({ queryKey: ["status"] });
      done();
    },
  });

  const changeMap = useMutation({
    mutationFn: (name: string) => api.changeMap(name),
    meta: { action: "Change map" },
    onSuccess: (_r, name) => {
      toast.success(`Loading ${name}`, {
        description: "Workshop maps download first — allow about a minute.",
      });
      qc.invalidateQueries({ queryKey: ["status"] });
      // The list carries which map is current, not just which exist.
      qc.invalidateQueries({ queryKey: ["maps"] });
      done();
    },
  });

  const restart = useMutation({
    mutationFn: () => api.restart(),
    meta: { action: "Restart" },
    onSuccess: () => {
      toast.success("Restarting the server");
      qc.invalidateQueries({ queryKey: ["status"] });
      qc.invalidateQueries({ queryKey: ["maps"] });
      done();
    },
  });

  return { pause, kick, changeMap, restart };
}
