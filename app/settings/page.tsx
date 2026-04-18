"use client";

import { Info } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Panel preferences and access.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Panel access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="admin-user">Admin username</Label>
              <Input id="admin-user" defaultValue="admin" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-pw">Admin password</Label>
              <Input id="admin-pw" type="password" placeholder="••••••••" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-none border p-3">
            <div>
              <Label>Require login</Label>
              <p className="text-xs text-muted-foreground">
                If disabled, anyone with network access can use the panel.
              </p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-none border p-3">
            <div>
              <Label>Desktop notifications</Label>
              <p className="text-xs text-muted-foreground">
                Notify on match state changes and server crashes.
              </p>
            </div>
            <Switch />
          </div>
          <div className="flex items-center justify-between rounded-none border p-3">
            <div>
              <Label>Autoscroll console</Label>
              <p className="text-xs text-muted-foreground">
                Default state for the Console page.
              </p>
            </div>
            <Switch defaultChecked />
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
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Version</span>
            <Badge variant="outline">0.1.0</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Mode</span>
            <Badge variant="outline">Mock (no backend)</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Project</span>
            <span className="font-mono text-xs">sidearm</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
