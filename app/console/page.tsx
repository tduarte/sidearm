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
  /*
   * A height-constrained column, not a scrolling stack: the log is the page,
   * and the RCON input has to stay on the bottom edge rather than below it.
   * `min-h-0` at every level is what lets the log shrink instead of pushing
   * the input out of view.
   */
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold">Console</h1>
        <p className="text-sm text-muted-foreground">
          Live server log and RCON input.
        </p>
      </div>
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="shrink-0 pb-2">
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
        <CardContent className="flex min-h-0 flex-1 flex-col">
          <ConsolePane />
        </CardContent>
      </Card>
    </div>
  );
}
