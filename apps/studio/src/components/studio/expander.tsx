import type { ComponentProps, ReactNode } from "react"
import { cn } from "cn"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export type ExpanderMarker = "chevron" | "triangle"

export type ExpanderProps = Omit<ComponentProps<typeof Button>, "children" | "variant" | "size"> & {
  readonly open: boolean
  readonly label: ReactNode
  readonly controls?: string
  readonly size?: "xs" | "sm"
  readonly marker?: ExpanderMarker
}

const TRIANGLE = "▸"

const MARKER: Readonly<Record<ExpanderMarker, (open: boolean) => ReactNode>> = {
  chevron: (open) => <ChevronRight aria-hidden className={cn("size-3 text-muted-foreground transition-transform", open && "rotate-90")} />,
  triangle: (open) => (
    <span aria-hidden className={cn("inline-block text-muted-foreground transition-transform", open && "rotate-90")}>
      {TRIANGLE}
    </span>
  ),
}

export function Expander({ open, label, controls, size = "xs", marker = "chevron", ...rest }: ExpanderProps) {
  return (
    <Button variant="outline" size={size} aria-expanded={open} aria-controls={controls} {...rest}>
      {MARKER[marker](open)}
      {label}
    </Button>
  )
}

export function DisclosureChevron() {
  return (
    <ChevronDown
      aria-hidden
      className="size-3 shrink-0 text-muted-foreground transition-transform in-data-[state=closed]:-rotate-90"
    />
  )
}
