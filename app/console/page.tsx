"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConsolePane } from "@/components/console-pane";

export default function ConsolePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Console</h1>
        <p className="text-sm text-muted-foreground">
          Live server log and RCON input.
        </p>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Live output</CardTitle>
          {/*
            The "Chat only" tab was removed: History already holds the full,
            searchable chat log, and rendering the same messages on two pages
            meant neither was obviously the place to look. The `chat` filter
            below still isolates chat within the live stream, which is the part
            that belongs here.
          */}
          <CardDescription>
            Everything the server logs, as it happens. Chat history lives in
            History.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConsolePane />
        </CardContent>
      </Card>
    </div>
  );
}
