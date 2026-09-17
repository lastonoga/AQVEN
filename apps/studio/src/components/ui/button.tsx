import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:stroke-[1.75] [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border border-border bg-card text-foreground shadow-none hover:border-ring aria-[haspopup]:aria-expanded:border-ring",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
        link: "text-foreground underline-offset-3 hover:underline",
        dashed:
          "border border-dashed border-border bg-transparent text-muted-foreground hover:border-ring hover:text-foreground",
        "outline-destructive":
          "border border-destructive-border bg-card text-destructive-fg hover:bg-destructive-bg",
      },
      size: {
        xs: "h-6.5 gap-1.5 rounded-sm px-2.25 text-2xs",
        sm: "h-8 gap-1.5 rounded-md px-3 text-md",
        md: "h-9 gap-1.75 rounded-md px-2.75 text-md",
        "icon-xs": "size-6.5 rounded-sm",
        "icon-sm": "size-7 rounded-md",
        icon: "size-8 rounded-md",
        badge: "h-7.5 gap-1.5 rounded-sm px-2.25 text-md shadow-xs",
        inline: "h-auto gap-1 p-0",
        "inline-xs": "h-auto gap-1 border-0 p-0 text-2xs leading-none",
        "icon-round": "size-8 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "md",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
