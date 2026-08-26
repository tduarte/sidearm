"use client";

import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { StatusLiveSync } from "@/components/status-live-sync";
import { AuthGate } from "@/components/auth-gate";
import { UnauthorizedError } from "@/lib/api/client";

/**
 * Per-mutation label for the failure toast, e.g. `meta: { action: "Restart" }`.
 * Without one the toast can still fire; it just has to be vaguer.
 */
declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { action?: string };
  }
}

function describeError(error: unknown): string {
  if (error instanceof UnauthorizedError) {
    return "Your session is no longer valid. Reload the page to sign in again.";
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.trim() || "No reason was reported.";
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false, retry: 1 },
        },
        /**
         * Every mutation reports its own failure, whether or not it remembered
         * to handle one.
         *
         * Previously 12 of 13 mutations had `onSuccess` and no `onError`, so
         * with the Docker socket down Start / Stop / Restart did nothing and
         * said nothing — the documented half-broken-panel mode, presented as
         * a working panel. Handling it here means the next mutation someone
         * adds is covered by default rather than by remembering.
         */
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            const action = mutation.meta?.action ?? "That action";
            toast.error(`${action} failed`, {
              description: describeError(error),
            });
          },
        }),
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={200}>
        <AuthGate>
          <StatusLiveSync />
          {children}
        </AuthGate>
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
