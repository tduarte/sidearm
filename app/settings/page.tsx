"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Info, Lock, SignOut } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { usePanelInfo } from "@/components/panel-info";
import { useConsolePrefs } from "@/lib/hooks/use-console-prefs";
import { api } from "@/lib/api/client";

/**
 * Panel settings — every row of which is now real.
 *
 * This page used to be entirely inert: uncontrolled inputs with `defaultValue`,
 * switches with no handler, no save button, and no API call anywhere in the
 * file. Worse, it described an auth model that does not exist — an admin
 * username and password, and a "Require login" toggle — when the actual
 * mechanism is a single `PANEL_ADMIN_TOKEN` env var. Those are gone rather
 * than wired, because there is nothing behind them to wire to.
 */
export default function SettingsPage() {
  const { apiMode, version } = usePanelInfo();
  const { autoscroll, setAutoscroll } = useConsolePrefs();

  const auth = useQuery({
    queryKey: ["auth-status"],
    queryFn: () => api.authStatus(),
  });

  const logout = useMutation({
    mutationFn: () => api.logout(),
    meta: { action: "Signing out" },
    onSuccess: () => {
      toast.success("Signed out");
      // A full reload is the honest way back to the token prompt: AuthGate
      // decides at mount, so re-rendering in place would leave it open.
      window.location.reload();
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Settings for the panel itself. Server settings live in Config.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" />
            Access
          </CardTitle>
          <CardDescription>
            The panel is protected by a single{" "}
            <code className="font-mono">PANEL_ADMIN_TOKEN</code> in{" "}
            <code className="font-mono">.env</code> — there are no accounts.
            Changing it needs a panel restart.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {auth.isPending ? (
            <Skeleton className="h-16" />
          ) : (
            <>
              <Row label="Token configured">
                <Badge variant="outline">
                  {auth.data?.tokenConfigured ? "Yes" : "No — panel is open"}
                </Badge>
              </Row>
              {auth.data?.trustedPeer && (
                <p className="text-xs text-muted-foreground">
                  This browser is exempt from the token because its address is
                  in <code className="font-mono">PANEL_TRUSTED_CIDRS</code>.
                  Note that behind a reverse proxy the matched address is the
                  proxy&apos;s, so everything reaching it is exempt.
                </p>
              )}
              {auth.data?.tokenConfigured && !auth.data?.trustedPeer && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logout.isPending}
                  onClick={() => logout.mutate()}
                >
                  <SignOut className="h-4 w-4" />
                  Sign out of this browser
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Preferences</CardTitle>
          <CardDescription>Stored in this browser only.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-none border p-3">
            <div>
              <Label htmlFor="autoscroll">Follow the console</Label>
              <p className="text-xs text-muted-foreground">
                Whether the console starts pinned to the newest line.
              </p>
            </div>
            <Switch
              id="autoscroll"
              checked={autoscroll}
              onCheckedChange={setAutoscroll}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" /> About
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Version">
            <Badge variant="outline">{version}</Badge>
          </Row>
          <Row label="Mode">
            <Badge variant="outline">
              {apiMode === "real" ? "Real (live server)" : "Mock (no backend)"}
            </Badge>
          </Row>
          <Row label="Project">
            <span className="font-mono text-xs">sidearm</span>
          </Row>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
