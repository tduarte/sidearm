import { DesignSwitcher } from "@/components/design/switcher";

/**
 * Five design directions for the panel, on fixture data.
 *
 * They render outside the app shell on purpose — see the note in
 * `components/app-shell.tsx`. Each page owns its own colours, type and
 * navigation model, so the only thing shared here is the strip that lets you
 * flip between them.
 */
export default function DesignLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-black">
      <DesignSwitcher />
      {children}
    </div>
  );
}
