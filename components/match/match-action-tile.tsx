"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { IconProps } from "@phosphor-icons/react";
import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

const tileVariants = cva(
  "flex w-full min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-none px-3 py-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground ring-1 ring-primary hover:bg-primary/90",
        outline:
          "bg-card text-foreground ring-1 ring-foreground/10 hover:bg-muted/30",
        active:
          "pointer-events-none bg-primary/10 text-foreground ring-2 ring-primary",
        destructive:
          "bg-card text-destructive ring-1 ring-destructive/45 hover:bg-destructive/10",
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  },
);

export type MatchActionTileProps = {
  icon: ComponentType<IconProps>;
  label: string;
  description?: string;
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  /** Maps to tile surface + ring; use `active` for current phase. */
  variant?: VariantProps<typeof tileVariants>["variant"];
  /** Current phase / pressed toggle (e.g. phase buttons). */
  pressed?: boolean;
  iconWeight?: IconProps["weight"];
  className?: string;
};

export function MatchActionTile({
  icon: Icon,
  label,
  description,
  onClick,
  disabled,
  pending,
  variant = "outline",
  pressed,
  iconWeight = "regular",
  className,
}: MatchActionTileProps) {
  return (
    <button
      type="button"
      aria-busy={pending || undefined}
      aria-pressed={pressed}
      disabled={disabled || pending}
      tabIndex={variant === "active" ? -1 : undefined}
      onClick={onClick}
      className={cn(tileVariants({ variant }), className)}
    >
      <Icon className="size-10 shrink-0" weight={iconWeight} />
      <span className="text-sm font-medium leading-tight">{label}</span>
      {description ? (
        <span className="line-clamp-2 text-[0.65rem] leading-snug text-muted-foreground">
          {description}
        </span>
      ) : null}
    </button>
  );
}

const gridCols = {
  phase: "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5",
  actions: "grid grid-cols-2 gap-3 sm:grid-cols-3",
  casual: "grid grid-cols-1 gap-3 sm:grid-cols-3",
  practice: "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
  /** Grenade / utility practice — same density as practice */
  nades: "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
} as const;

export type MatchActionGridProps = {
  children: ReactNode;
  layout: keyof typeof gridCols;
  className?: string;
};

export function MatchActionGrid({
  children,
  layout,
  className,
}: MatchActionGridProps) {
  return <div className={cn(gridCols[layout], className)}>{children}</div>;
}
