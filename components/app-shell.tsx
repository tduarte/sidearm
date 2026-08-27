"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/sidebar-nav";
import { TopBar } from "@/components/top-bar";
import { ControlPlaneBanner } from "@/components/control-plane-banner";
import { CommandPalette } from "@/components/command-palette";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset>
        <TopBar />
        <ControlPlaneBanner />
        <CommandPalette />
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
