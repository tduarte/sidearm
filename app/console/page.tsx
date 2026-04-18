"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConsolePane } from "@/components/console-pane";

export default function ConsolePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Console</h1>
        <p className="text-sm text-muted-foreground">
          Live server log and RCON command input.
        </p>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Live output</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="chat">Chat only</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-4">
              <ConsolePane />
            </TabsContent>
            <TabsContent value="chat" className="mt-4">
              <ConsolePane chatOnly />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
