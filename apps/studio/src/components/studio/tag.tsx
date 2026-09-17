import type { ComponentProps, ReactNode } from "react"
import { cva } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"
import { hasContent } from "./rich"
import type { Tone } from "./tone"

export type TagFill = "soft" | "tint" | "outline" | "stroke" | "solid" | "ground"
export type TagSize = "micro" | "xs" | "sm" | "md" | "lg" | "canvas" | "edge" | "ref"
export type TagShape = "box" | "round" | "pill" | "square"

export type TagProps = Omit<ComponentProps<"span">, "children"> & {
  readonly tone?: Tone
  readonly fill?: TagFill
  readonly size?: TagSize
  readonly shape?: TagShape
  readonly dashed?: boolean
  readonly wrap?: boolean
  readonly interactive?: boolean
  readonly leading?: ReactNode
  readonly detail?: ReactNode
  readonly asChild?: boolean
  readonly children: ReactNode
}

export type TagSpec = Pick<TagProps, "tone" | "fill" | "size" | "dashed"> & {
  readonly children: string
  readonly leading?: string
}

export const tagVariants = cva("inline-flex shrink-0 items-center gap-1 border font-mono whitespace-nowrap", {
  variants: {
    fill: {
      soft: "border-tone-border bg-tone-bg text-tone-fg",
      tint: "border-transparent bg-tone-bg text-tone-fg",
      outline: "border-tone-border bg-transparent text-tone-fg",
      stroke: "border-tone bg-transparent text-tone-fg",
      solid: "border-transparent bg-tone text-primary-foreground",
      ground: "border-transparent bg-background-subtle text-tone-fg",
    },
    size: {
      micro: "h-4.25 rounded-xs px-1.5 text-5xs font-semibold tracking-[.03em] leading-none",
      xs: "h-4.75 rounded-sm px-1.5 text-4xs font-semibold tracking-[.02em] leading-none",
      sm: "h-5 rounded-sm px-1.75 text-3xs font-medium leading-none",
      md: "h-6 rounded-md px-2.25 text-2xs font-medium leading-none",
      lg: "h-7 rounded-md px-2.75 text-xs font-semibold leading-none",
      canvas: "h-7.5 rounded-md px-3 font-sans text-lg font-medium leading-none",
      edge: "h-5.25 rounded-xs px-1.75 text-md font-normal leading-none",
      ref: "h-4.75 rounded-xs px-1.25 text-4xs font-normal leading-none",
    },
    shape: {
      box: "",
      round: "rounded-md",
      pill: "rounded-full",
      square: "",
    },
    dashed: {
      true: "border-dashed",
      false: "",
    },
    wrap: {
      true: "h-auto min-h-6 flex-wrap py-0.75 whitespace-normal wrap-anywhere",
      false: "",
    },
    interactive: {
      true: "cursor-pointer outline-none hover:ring-2 hover:ring-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
      false: "",
    },
  },
  compoundVariants: [
    { shape: "square", size: ["micro", "xs"], class: "size-4 justify-center px-0" },
    { shape: "square", size: "sm", class: "size-5 justify-center px-0" },
    { fill: "outline", size: "md", shape: ["box", "round"], class: "font-normal" },
  ],
  defaultVariants: {
    fill: "soft",
    size: "sm",
    shape: "box",
    dashed: false,
    wrap: false,
    interactive: false,
  },
})

export function Tag({
  tone = "neutral",
  fill,
  size,
  shape,
  dashed,
  wrap,
  interactive,
  leading,
  detail,
  asChild = false,
  className,
  children,
  ...rest
}: TagProps) {
  const Root = asChild ? Slot.Root : "span"
  return (
    <Root
      data-tone={tone}
      className={cn(tagVariants({ fill, size, shape, dashed, wrap, interactive }), className)}
      {...rest}
    >
      {hasContent(leading) ? <span className="inline-flex shrink-0">{leading}</span> : null}
      <Slot.Slottable>{children}</Slot.Slottable>
      {detail === undefined ? null : <span className="font-normal opacity-75">{detail}</span>}
    </Root>
  )
}
