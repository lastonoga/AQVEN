import { cva } from "class-variance-authority"
import type { Tone } from "./tone"

export type DotProps = {
  readonly tone: Tone
  readonly hollow?: boolean
  readonly size?: "xs" | "sm" | "md"
  readonly shape?: "round" | "square"
  readonly pulse?: boolean
  readonly label?: string
}

const dotVariants = cva("inline-block shrink-0", {
  variants: {
    size: {
      xs: "size-1.5",
      sm: "size-1.75",
      md: "size-2",
    },
    shape: {
      round: "rounded-full",
      square: "rounded-xs",
    },
    hollow: {
      true: "rounded-full border border-tone bg-transparent",
      false: "bg-tone",
    },
    pulse: {
      true: "animate-pulse-dot",
      false: "",
    },
  },
  defaultVariants: {
    size: "sm",
    shape: "round",
    hollow: false,
    pulse: false,
  },
})

export function Dot({ tone, hollow, size, shape, pulse, label }: DotProps) {
  const dot = <span aria-hidden data-tone={tone} className={dotVariants({ size, shape, hollow, pulse })} />
  if (label === undefined) return dot
  return (
    <>
      {dot}
      <span className="sr-only">{label}</span>
    </>
  )
}
