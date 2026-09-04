"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckCircleIcon, InfoIcon, WarningIcon, XCircleIcon, SpinnerIcon } from "@phosphor-icons/react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CheckCircleIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <WarningIcon className="size-4" />
        ),
        error: (
          <XCircleIcon className="size-4" />
        ),
        loading: (
          <SpinnerIcon className="size-4 animate-spin" />
        ),
      }}
      /*
        The dock's surface, not the popover token: a toast fires over the stage
        and reads as part of it. Same near-black at 94% and same hairline as
        `.bc__chip`, with the blur in `app/globals.css` — sonner sets these
        inline, so a stylesheet cannot reach them.
      */
      style={
        {
          "--normal-bg": "rgba(12, 14, 19, 0.94)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "rgba(255, 255, 255, 0.2)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
