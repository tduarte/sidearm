"use client";

/**
 * The Broadcast shell.
 *
 * The panel used to be a sidebar wrapped around seven pages. This replaces it
 * with the world chosen at `/design/broadcast`: the current match is the
 * product, so it gets the whole stage, and everything else in the panel is a
 * strip of links across the top of it.
 *
 * Three things follow from that and are worth stating, because they are the
 * reasons this is not just the old shell with a dark theme.
 *
 * 1. The map the server is actually on is the background of every page. Not
 *    decoration — it is the fastest available answer to "what is running", and
 *    it is legible from across a room in a way a text field is not.
 * 2. There is no Dashboard link. The match is what you are already on; the
 *    wordmark is the way back to it. A nav entry for the place you start is a
 *    nav entry nobody presses.
 * 3. The rail is the only chrome. It carries condition, identity, the connect
 *    string and whether a demo is running — the four facts someone opens this
 *    panel to check — and then gets out of the way.
 *
 * `/design/*` still renders bare: those five explorations exist to each be a
 * different world, and framing them in this one would make them five themes of
 * the same page.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Copy, Crosshair, MagnifyingGlass } from "@phosphor-icons/react";
import { ControlPlaneBanner } from "@/components/control-plane-banner";
import { CommandPalette, openCommandPalette } from "@/components/command-palette";
import { ActionBar } from "@/components/action-bar";
import { Lifecycle } from "@/components/broadcast/lifecycle";
import { RAIL_NAV } from "@/components/nav";
import { useSession } from "@/components/session-provider";
import { formatEta, gb } from "@/components/update-progress-card";
import { useServerStatus } from "@/lib/hooks/use-server-status";
import { useMatchState } from "@/lib/hooks/use-match-state";
import { getOfficialMapArtPath } from "@/lib/maps/official-art";
import type { ServerState } from "@/lib/api/types";
import "@/app/broadcast.css";

/** The surface that carries its own dock, and so needs the room under it. */
const DOCKED = "/dashboard";

/**
 * Server condition as the bus reads it.
 *
 * `unknown` gets its own neutral treatment rather than borrowing "off air":
 * both control planes being silent is the absence of evidence, and rendering it
 * as either the reassuring answer or the alarming one is a lie the rest of the
 * panel is careful not to tell.
 */
function bus(state: ServerState): { label: string; className: string } {
  switch (state) {
    case "running":
      return { label: "On air", className: "" };
    case "starting":
      return { label: "Starting", className: " bc__bus--wait" };
    case "stopping":
      return { label: "Stopping", className: " bc__bus--wait" };
    case "updating":
      return { label: "Updating", className: " bc__bus--wait" };
    case "stopped":
      return { label: "Off air", className: " bc__bus--wait" };
    case "crashed":
      return { label: "Crashed", className: " bc__bus--bad" };
    case "unknown":
      return { label: "No signal", className: " bc__bus--unknown" };
  }
}

export function BroadcastShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDesign = pathname.startsWith("/design");

  if (isDesign) return <>{children}</>;
  return <Shell pathname={pathname}>{children}</Shell>;
}

function Shell({
  children,
  pathname,
}: {
  children: React.ReactNode;
  pathname: string;
}) {
  const { data: status } = useServerStatus();
  const { data: match } = useMatchState();
  const { user, can } = useSession();
  const [copied, setCopied] = useState(false);

  const docked = pathname === DOCKED;
  const art = status ? getOfficialMapArtPath(status.map) : undefined;
  const condition = bus(status?.state ?? "unknown");
  const nav = RAIL_NAV.filter((item) => can(item.role));
  const recording = match?.demo.state === "recording";

  return (
    <div className={`bc${docked ? " bc--docked" : ""}`}>
      {/*
        The art is the map the server is on right now, never a staged one — the
        largest object on the screen has to be the truest. It fades rather than
        cuts when the map changes, and dims when the panel has lost the server,
        which is the one moment the stage should not look confident.
      */}
      {art && (
        <div
          className="bc__art"
          style={{
            backgroundImage: `url(${art})`,
            opacity: status?.state === "unknown" ? 0.11 : undefined,
          }}
          aria-hidden
        />
      )}
      <div className="bc__veil" aria-hidden />

      <div className="bc__body">
        <div className="bc__rail">
          <Link
            href="/dashboard"
            className="bc__navLink"
            aria-current={pathname === "/dashboard" ? "page" : undefined}
            aria-label="sidearm — the match"
          >
            <Crosshair size={15} weight="bold" aria-hidden />
            <b>sidearm</b>
          </Link>

          <span className={`bc__bus${condition.className}`}>{condition.label}</span>

          {/*
            An update is a container that comes back an hour later, so while one
            is running the rail owes you a number rather than the word
            "Updating" and silence. The dashboard used to carry a card for this;
            it belongs beside the condition it qualifies.
          */}
          {status?.state === "updating" && (
            <span className="bc__updating">
              {status.updateProgress
                ? [
                    `${status.updateProgress.phase} · ${gb(status.updateProgress.bytesDone)} / ${gb(status.updateProgress.bytesTotal)}`,
                    formatEta(status.updateProgress.etaSec),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "starting up"}
            </span>
          )}

          {status && (
            <>
              <span>
                <b>{status.hostname}</b> · {status.players}/{status.maxPlayers ?? "?"}
              </span>
              {/*
                The connect string is the single most handed-around fact in the
                product, so it is a control rather than text you have to select
                by hand.
              */}
              <button
                className="bc__copy"
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(status.connectUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
                title="Copy the connect command"
              >
                <b>
                  {status.ip}:{status.port}
                </b>
                <Copy size={12} weight="bold" aria-hidden />
                {copied ? "Copied" : "Copy"}
              </button>
              <span
                className={recording ? "bc__rec" : "bc__rec bc__rec--off"}
                title={match?.demo.name ?? "No demo running"}
              >
                {recording ? "● Rec" : "Not recording"}
              </span>
            </>
          )}

          <div className="bc__meta">
            <Lifecycle />
            {/*
              ⌘K is invisible until someone tells you about it, and on a phone
              there is no ⌘ to press. The chip is the palette's only discoverable
              entrance, so it is drawn for everyone — the palette filters its own
              contents by role, and navigation alone is worth the keystroke.
            */}
            <button
              className="bc__k"
              type="button"
              onClick={() => openCommandPalette()}
              aria-label="Open the command palette"
            >
              <MagnifyingGlass size={13} weight="bold" aria-hidden />
              <span className="bc__kLabel">Search</span>
              <kbd className="bc__kKeys" aria-hidden>
                ⌘K
              </kbd>
            </button>
            <nav className="bc__nav" aria-label="Panel">
              {nav.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="bc__navLink"
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={15} weight="bold" aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            {user && (
              <Link href="/settings" className="bc__me">
                <b>{user.username}</b> · {user.role}
              </Link>
            )}
          </div>
        </div>

        <ControlPlaneBanner />
        <CommandPalette />

        {/*
          The match owns the whole stage and lays itself out; every other route
          is a document, so it gets a scrolling column with a reading measure.
        */}
        {docked ? (
          children
        ) : (
          <main className="bc__stage">
            <div className="bc__stageIn">{children}</div>
          </main>
        )}
      </div>

      {/*
        Off the match, the intervention bar is still the only thumb-reachable
        way to pause or kick on a phone. On the match, the dock is that, and two
        fixed bars on the same edge is one too many.
      */}
      {!docked && <ActionBar />}
    </div>
  );
}
