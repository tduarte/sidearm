"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Gauge,
  Terminal,
  UsersThree,
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

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/match", label: "Match Control", icon: Trophy },
  { href: "/players", label: "Players", icon: UsersThree },
  { href: "/maps", label: "Maps", icon: MapTrifold },
  { href: "/console", label: "Console", icon: Terminal },
  { href: "/config", label: "Config", icon: Sliders },
  { href: "/history", label: "History", icon: ClockCounterClockwise },
  { href: "/settings", label: "Settings", icon: Gear },
] as const;

export function SidebarNav() {
  const pathname = usePathname();

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
              {NAV.map((item) => {
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
          v0.1.0 · mock mode
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
