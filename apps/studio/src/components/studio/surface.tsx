import type { ComponentProps } from "react"
import { cva } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"
import type { Tone } from "./tone"

export type SurfaceVariant =
  | "panel"
  | "raised"
  | "well"
  | "frame"
  | "popover"
  | "bubble"
  | "sheet"
  | "bar"
  | "footer"
  | "tray"
  | "callout"
  | "tinted"
  | "outlined"
  | "dashed"
  | "spotlight"
  | "plain"

export type SurfaceProps = ComponentProps<"div"> & {
  readonly variant?: SurfaceVariant
  readonly radius?: "md" | "lg"
  readonly padding?: "none" | "xs" | "sm" | "md" | "lg"
  readonly tone?: Tone
  readonly accent?: "left-3" | "left-4" | "top-2"
  readonly interactive?: boolean
  readonly selected?: boolean
  readonly asChild?: boolean
}

export const surfaceVariants = cva("", {
  variants: {
    variant: {
      panel: "rounded-xl border border-border bg-card",
      raised: "rounded-xl border border-border bg-card shadow-xs",
      well: "rounded-lg border border-border bg-background-subtle",
      frame: "overflow-hidden rounded-xl border border-border bg-muted shadow-sm",
      popover: "rounded-xl border border-border bg-card shadow-popover",
      bubble: "rounded-xl bg-muted",
      sheet: "border-l border-border bg-card shadow-sheet",
      bar: "border-b border-border bg-card",
      footer: "border-t border-border bg-card",
      tray: "border-t border-border bg-background-subtle",
      callout: "rounded-lg border border-tone-border bg-tone-bg text-tone-fg",
      tinted: "rounded-xl border border-tone-border bg-[color-mix(in_oklab,var(--tone-bg)_40%,var(--card))]",
      outlined: "rounded-xl border border-tone-border bg-card",
      dashed: "rounded-xl border border-dashed border-border bg-transparent",
      spotlight:
        "pointer-events-none rounded-xl border-2 border-tone shadow-[0_0_0_6px_var(--ring-llm),0_0_0_100000px_color-mix(in_oklab,var(--background-subtle)_72%,transparent)]",
      plain: "bg-background text-foreground",
    },
    radius: {
      md: "rounded-md",
      lg: "rounded-lg",
    },
    padding: {
      none: "",
      xs: "px-2.25 py-2",
      sm: "px-3 py-2.75",
      md: "px-3.5 py-3.25",
      lg: "px-3.75 py-3.5",
    },
    accent: {
      "left-3": "border-l-[3px] border-l-tone",
      "left-4": "border-l-4 border-l-tone",
      "top-2": "border-t-2 border-t-tone",
    },
    interactive: {
      true: "cursor-pointer outline-none transition-colors hover:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 selected:border-tone-border selected:hover:border-ring selected:bg-tone-bg",
      false: "",
    },
  },
  defaultVariants: {
    variant: "panel",
    padding: "none",
    interactive: false,
  },
})

export function Surface({
  variant,
  radius,
  padding,
  tone = "neutral",
  accent,
  interactive,
  selected = false,
  asChild = false,
  className,
  ...rest
}: SurfaceProps) {
  const Root = asChild ? Slot.Root : "div"
  return (
    <Root
      data-tone={tone}
      aria-current={selected ? "true" : undefined}
      className={cn(surfaceVariants({ variant, radius, padding, accent, interactive }), className)}
      {...rest}
    />
  )
}
