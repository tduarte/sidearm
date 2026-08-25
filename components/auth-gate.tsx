"use client";

import { useEffect, useState } from "react";
import { Lock } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, UnauthorizedError } from "@/lib/api/client";

type State = "checking" | "open" | "locked";

/**
 * Renders a token prompt when `PANEL_ADMIN_TOKEN` is set and this browser has no
 * valid session cookie. With no token configured the panel is open and this
 * renders its children immediately.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("checking");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { authRequired } = await api.authStatus();
        if (cancelled) return;
        if (!authRequired) {
          setState("open");
          return;
        }
        // Auth is on — probe a protected route to see if our cookie is valid.
        await api.getStatus();
        if (!cancelled) setState("open");
      } catch (err) {
        if (cancelled) return;
        setState(err instanceof UnauthorizedError ? "locked" : "open");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "checking") return null;
  if (state === "open") return <>{children}</>;

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="size-4" weight="fill" />
            Admin token required
          </CardTitle>
          <CardDescription>
            This panel is protected by <code>PANEL_ADMIN_TOKEN</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await api.login(token);
                setState("open");
              } catch {
                setError("That token was not accepted.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="admin-token">Token</Label>
              <Input
                id="admin-token"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={!token || busy}>
              {busy ? "Checking…" : "Unlock"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
