"use client";

/**
 * Settings, as a document.
 *
 * Everything the panel administers rather than operates now lives here, in one
 * scrolling column: the `/config` page and the `/maps` page folded in, plus the
 * ban list, which had a full set of working routes and no UI at all.
 *
 * This is deliberately *not* the Broadcast world. The stage is for the match —
 * a thing you watch and change under time pressure — and these are settings you
 * read carefully and change twice a year. Rendering them at stadium scale would
 * be a costume. They get the reading column `.bc__stage` already gives every
 * non-match route, and shadcn's cards inside it.
 *
 * Sections appear by role, and a section nobody in this role can act on is not
 * drawn. Both halves of Maps write through admin routes (a subscribe downloads
 * gigabytes; a rotation outlives the session), so a moderator sees neither
 * rather than seeing controls that 403.
 */

import { Info } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePanelInfo } from "@/components/panel-info";
import { BanList } from "@/components/players/ban-list";
import { AccountCard } from "@/components/settings/account-card";
import { MapsCard } from "@/components/settings/maps-card";
import { ServerCard } from "@/components/settings/server-card";
import { UsersCard } from "@/components/settings/users-card";
import { useSession } from "@/components/session-provider";

export default function SettingsPage() {
  const { apiMode, version } = usePanelInfo();
  const { can } = useSession();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          What the server is set up to be, who can change it, and what this
          panel is. Running the match happens on the dashboard.
        </p>
      </div>

      {can("admin") && (
        <Section
          title="Server"
          lede="How the server presents itself, and the part of that the panel cannot change from in here."
        >
          <ServerCard />
        </Section>
      )}

      {can("admin") && (
        <Section
          title="Maps"
          lede="The library and the cycle. Choosing what to play right now is on the dashboard."
        >
          <MapsCard />
        </Section>
      )}

      {can("moderator") && (
        <Section
          title="Bans"
          lede="Who is kept out, and until when. Banning someone happens from the scoreboard."
        >
          {/*
            `BanList` renders nothing when nobody is banned, which is the right
            call inside a page — but under a heading it would leave the heading
            standing over an empty space. The heading is worth the cost: it is
            how you learn the panel keeps bans at all.
          */}
          <BanList />
          <p className="text-xs text-muted-foreground">
            CS2 holds bans in memory only and forgets them when the container
            restarts, so the panel owns the clock and re-applies them when RCON
            reconnects.
          </p>
        </Section>
      )}

      <Section title="Your account" lede="This sign-in, on this panel.">
        <AccountCard />
      </Section>

      {can("admin") && (
        <Section title="People" lede="Who else can sign in, and as what.">
          <UsersCard />
        </Section>
      )}

      <Section title="About" lede="What is running.">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="h-4 w-4" /> Panel
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
      </Section>
    </div>
  );
}

function Section({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          {title}
        </h2>
        <p className="text-xs text-muted-foreground">{lede}</p>
      </div>
      {children}
    </section>
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
