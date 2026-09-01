"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/sidebar-nav";
import { TopBar } from "@/components/top-bar";
import { ControlPlaneBanner } from "@/components/control-plane-banner";
import { CommandPalette } from "@/components/command-palette";
import { ActionBar } from "@/components/action-bar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <SidebarNav />
      {/*
        A definite height, not `min-h-svh`. The shadcn wrapper only sets a
        minimum, so `h-full` anywhere inside resolved to `auto` and a page that
        wants to fill the viewport — Console, whose RCON input has to sit on
        the bottom edge — could not. Pinning the height here and letting `main`
        own the scrolling is what makes that possible for every page.
      */}
      <SidebarInset className="h-svh overflow-hidden">
        <TopBar />
        <ControlPlaneBanner />
        <CommandPalette />
        {/*
          The bottom padding is what keeps the last row of any page above the
          fixed ActionBar; without it the final control on every scrollable
          page sits underneath the bar and cannot be tapped.
        */}
        <main className="min-h-0 flex-1 overflow-auto p-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:p-6 md:pb-6">
          {children}
        </main>
        <ActionBar />
      </SidebarInset>
    </SidebarProvider>
  );
}
