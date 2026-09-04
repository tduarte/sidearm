"use client";

import { createContext, useContext, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type SessionUser } from "@/lib/api/client";
import { roleAtLeast, type Role } from "@/lib/auth/permissions";

export type SessionState = {
  /** Null for a bearer-token or trusted-network caller: authority without an account. */
  user: SessionUser | null;
  role: Role | null;
  source: "session" | "token" | "trusted-peer" | null;
  firstRun: boolean;
  tokenConfigured: boolean;
  /** True when the caller's role reaches `needed`. */
  can: (needed: Role) => boolean;
  refresh: () => void;
};

const SessionContext = createContext<SessionState | null>(null);

export const SESSION_QUERY_KEY = ["auth", "session"] as const;

/**
 * Fetches `/api/auth` once and shares it.
 *
 * The role lives in a context rather than in each component's own query so that
 * the nav, the action bar and every guarded button agree about who is signed in
 * — a UI that disagrees with itself about permissions is how you get a visible
 * button that always fails.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const { data } = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => api.authStatus(),
    staleTime: 60_000,
    retry: false,
  });

  const value = useMemo<SessionState>(
    () => ({
      user: data?.user ?? null,
      role: data?.role ?? null,
      source: data?.source ?? null,
      firstRun: data?.firstRun ?? false,
      tokenConfigured: data?.tokenConfigured ?? false,
      can: (needed: Role) => roleAtLeast(data?.role ?? null, needed),
      refresh: () => void client.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
    }),
    [data, client],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used inside <SessionProvider>");
  }
  return ctx;
}

/**
 * Convenience for the common case: `const canKick = useCan("moderator")`.
 *
 * Server-side enforcement is the real boundary (`lib/auth/permissions.ts`);
 * this only decides whether to draw the control.
 */
export function useCan(needed: Role): boolean {
  return useSession().can(needed);
}
