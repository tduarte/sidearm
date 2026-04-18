import type { Metadata } from "next";
import { Geist_Mono, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";

const geistMonoHeading = Geist_Mono({subsets:['latin'],variable:'--font-heading'});

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    <html lang="en" className={cn("h-full dark antialiased", geistMono.variable, "font-sans", geist.variable, geistMonoHeading.variable)}>
      <body className="min-h-full flex flex-col font-sans text-[13px]">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
