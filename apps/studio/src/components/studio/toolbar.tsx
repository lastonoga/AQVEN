import type { ComponentProps, ReactNode } from "react"
import { cva } from "class-variance-authority"
import { cn } from "cn"
import { hasContent } from "./rich"

export type ToolbarProps = ComponentProps<"div"> & {
  readonly size?: "sm" | "md" | "lg" | "card" | "card-sm"
  readonly end?: ReactNode
  readonly wrap?: boolean
  readonly scroll?: boolean
  readonly stack?: boolean
}

const toolbarVariants = cva("flex min-w-0 items-center", {
  variants: {
    size: {
      sm: "gap-2 px-2.75 py-2.25",
      md: "gap-2.25 px-3.5 py-2.25",
      lg: "h-12 gap-2 px-2.5",
      card: "gap-3 px-3 py-2.5",
      "card-sm": "gap-2.25 px-3 py-2.5",
    },
    wrap: {
      true: "flex-wrap",
      false: "",
    },
    scroll: {
      true: "overflow-x-auto",
      false: "",
    },
    stack: {
      true: "flex-col items-stretch",
      false: "",
    },
  },
  defaultVariants: {
    wrap: false,
    scroll: false,
    stack: false,
  },
})

export function Toolbar({ size, end, wrap, scroll, stack, className, children, ...rest }: ToolbarProps) {
  return (
    <div className={cn(toolbarVariants({ size, wrap, scroll, stack }), className)} {...rest}>
      {children}
      {hasContent(end) ? <div className="ml-auto flex shrink-0 items-center gap-2">{end}</div> : null}
    </div>
  )
}
