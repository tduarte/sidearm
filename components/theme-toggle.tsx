"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Desktop, Moon, Sun } from "@phosphor-icons/react";
import { Label } from "@/components/ui/label";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Desktop },
] as const;

/** Never resubscribes; the store is "has this rendered in a browser yet". */
const noopSubscribe = () => () => {};

/**
 * Light / dark / follow-the-system.
 *
 * Nothing is selected until hydration: the chosen theme lives in localStorage,
 * which the server cannot read, so rendering a selection during SSR would show
 * the wrong one for a frame on every load. `useSyncExternalStore` answers
 * "false on the server, true in the browser" without a state write in an
 * effect.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <Label htmlFor="theme-toggle">Appearance</Label>
        <p className="text-xs text-muted-foreground">
          System follows your operating system.
        </p>
      </div>
      <ToggleGroup
        id="theme-toggle"
        type="single"
        variant="outline"
        size="sm"
        value={mounted ? (theme ?? "system") : undefined}
        onValueChange={(v) => v && setTheme(v)}
      >
        {OPTIONS.map(({ value, label, Icon }) => (
          <ToggleGroupItem key={value} value={value} aria-label={label} title={label}>
            <Icon className="size-4" />
            <span className="sr-only sm:not-sr-only sm:ml-1.5">{label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
