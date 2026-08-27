"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { CvarGroup, CvarSnapshot, CvarState } from "@/lib/api/types";

/**
 * Live cvar values for one group.
 *
 * `enabled` is the important part: RCON is a single serialised socket and the
 * 2s status poll already owns most of its budget, so these reads only happen
 * while the tab that shows them is actually mounted. Unmounting the tab stops
 * the polling by construction rather than by remembering to.
 */
export function useCvarGroup(group: CvarGroup, enabled: boolean) {
  const qc = useQueryClient();

  const query = useQuery<CvarSnapshot>({
    queryKey: ["cvars", group],
    queryFn: () => api.getCvars(group),
    enabled,
    refetchInterval: enabled ? 3000 : false,
    staleTime: 2000,
  });

  const setCvar = useMutation({
    mutationFn: ({ name, value }: { name: string; value: string }) =>
      api.setCvar(name, value),
    meta: { action: "Setting the cvar" },
    onSuccess: (result: CvarState) => {
      // Patch in the value the SERVER reported, not the one requested — a
      // cheat-protected cvar refused while sv_cheats is 0 echoes back
      // unchanged, and the tile must show that rather than flipping.
      qc.setQueryData<CvarSnapshot>(["cvars", group], (prev) =>
        prev
          ? {
              ...prev,
              cvars: prev.cvars.map((c) =>
                c.name === result.name ? result : c,
              ),
            }
          : prev,
      );
    },
  });

  const byName = new Map(query.data?.cvars.map((c) => [c.name, c]) ?? []);
  return { query, setCvar, byName };
}
