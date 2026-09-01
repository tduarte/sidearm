"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Gauge,
  Terminal,
  MapTrifold,
  Gear,
  ClockCounterClockwise,
  Sliders,
  Trophy,
  Crosshair,
} from "@phosphor-icons/react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { usePanelInfo } from "@/components/panel-info";
import { useSession } from "@/components/session-provider";
import type { Role } from "@/lib/auth/permissions";

/**
 * `role` is the minimum needed to reach the page at all — the same bar the
 * server enforces on the routes each page calls. A viewer shown a Console link
 * would arrive at a page of 403s, so the entry is not drawn rather than being
 * drawn and disabled.
 */
const NAV: Array<{
  href: string;
  label: string;
  icon: typeof Gauge;
  role: Role;
}> = [
  // No Players entry: the roster lives on the Dashboard now, and a nav item
  // that bounces you somewhere else is worse than no nav item.
  { href: "/dashboard", label: "Dashboard", icon: Gauge, role: "viewer" },
  { href: "/match", label: "Match Control", icon: Trophy, role: "moderator" },
  { href: "/maps", label: "Maps", icon: MapTrifold, role: "moderator" },
  { href: "/console", label: "Console", icon: Terminal, role: "moderator" },
  { href: "/config", label: "Config", icon: Sliders, role: "admin" },
  { href: "/history", label: "History", icon: ClockCounterClockwise, role: "viewer" },
  { href: "/settings", label: "Settings", icon: Gear, role: "viewer" },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { apiMode, version } = usePanelInfo();
  const { can } = useSession();
  const nav = NAV.filter((item) => can(item.role));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-1 py-1 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3">
        <div className="flex items-center gap-2.5 px-2 py-3.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:p-0">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground group-data-[collapsible=icon]:size-8">
            <Crosshair
              weight="bold"
              className="size-5 group-data-[collapsible=icon]:size-[1.125rem]"
            />
          </div>
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-semibold leading-none">sidearm</span>
            <span className="text-xs text-muted-foreground">CS2 panel</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-2 px-1 group-data-[collapsible=icon]:px-2">
        <SidebarGroup className="py-1 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-2">
          <SidebarGroupLabel className="mb-1.5 h-9 px-2 text-[0.8125rem] font-medium tracking-wide group-data-[collapsible=icon]:hidden">
            Server
          </SidebarGroupLabel>
          <SidebarGroupContent className="text-sm">
            <SidebarMenu className="gap-1 group-data-[collapsible=icon]:gap-2">
              {nav.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      size="lg"
                      tooltip={item.label}
                      className="gap-3 text-sm leading-snug [&_svg]:size-5"
                    >
                      <Link href={item.href} aria-label={item.label}>
                        <Icon className="size-5 shrink-0" />
                        <span className="group-data-[collapsible=icon]:hidden">
                          {item.label}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-1 py-1">
        <div className="px-2 py-3 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          v{version} · {apiMode === "real" ? "real mode" : "mock mode"}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
