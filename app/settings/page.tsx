"use client";

import { Info } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePanelInfo } from "@/components/panel-info";
import { AccountCard } from "@/components/settings/account-card";
import { UsersCard } from "@/components/settings/users-card";
import { useSession } from "@/components/session-provider";
import { useConsolePrefs } from "@/lib/hooks/use-console-prefs";

/**
 * Panel settings: your account, who else has one, and this browser's
 * preferences. Server settings live in Config.
 *
 * The page once described an auth model the panel did not have — an admin
 * username and password over a shared-token backend. It has one now, so those
 * rows are real rather than removed.
 */
export default function SettingsPage() {
  const { apiMode, version } = usePanelInfo();
  const { autoscroll, setAutoscroll } = useConsolePrefs();
  const { can } = useSession();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Settings for the panel itself. Server settings live in Config.
        </p>
      </div>

      <AccountCard />

      {can("admin") && <UsersCard />}

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
