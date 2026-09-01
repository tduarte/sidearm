import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { PanelInfoProvider } from "@/components/panel-info";
import pkg from "../package.json";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * The panel must be rendered per request, not prerendered at build time.
 *
 * `API_MODE` is a property of the running container. With the default static
 * prerender, the root layout executes during `next build` — where it is unset —
 * and "mock" is frozen into the HTML for every page. That is the same
 * build-time trap that `NEXT_PUBLIC_API_MODE` fell into, one level up.
 *
 * Nothing here benefits from being static anyway: every page is a client shell
 * that fetches live server state on mount.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "sidearm · CS2 server panel",
  description:
    "Admin panel for a self-hosted Counter-Strike 2 dedicated server.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // next-themes writes the theme class here before paint, from its inline
      // script, so the server-rendered markup cannot match. Suppressing the
      // warning on this element is its documented App Router pattern.
      suppressHydrationWarning
      className={cn("h-full antialiased", geistSans.variable, geistMono.variable)}
    >
      <body className="min-h-full flex flex-col font-sans">
        {/*
          Read here, in a server component, so it reflects the running
          container rather than whatever was set when the image was built.
        */}
        <PanelInfoProvider
          value={{
            apiMode: process.env.API_MODE === "real" ? "real" : "mock",
            version: pkg.version,
          }}
        >
          <Providers>
            <AppShell>{children}</AppShell>
          </Providers>
        </PanelInfoProvider>
      </body>
    </html>
  );
}
