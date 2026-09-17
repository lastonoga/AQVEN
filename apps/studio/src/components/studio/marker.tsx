import type { ReactNode } from "react"
import { cn } from "cn"
import type { MarkerShape } from "./presets"
import { textVariants } from "./text"
import type { Tone } from "./tone"

export type { MarkerShape } from "./presets"

export type MarkerSize = "md" | "canvas"

export type MarkerProps = {
  readonly shape: MarkerShape
  readonly tone: Tone
  readonly size?: MarkerSize
  readonly children?: ReactNode
  readonly label?: string
}

type MarkerSizeSpec = {
  readonly box: string
  readonly glyph: string
  readonly square: string
  readonly elevation: string
}

type MarkerAccessibility = { readonly "aria-hidden": true } | { readonly role: "img"; readonly "aria-label": string }

type MarkerViewProps = {
  readonly tone: Tone
  readonly spec: MarkerSizeSpec
  readonly children: ReactNode
  readonly accessibility: MarkerAccessibility
}

const END_GLYPH = "∎"

const MARKER_SIZE: Readonly<Record<MarkerSize, MarkerSizeSpec>> = {
  md: {
    box: "size-6",
    glyph: textVariants({ role: "tiny", weight: "semibold" }),
    square: "rounded-xs border-[1.5px]",
    elevation: "",
  },
  canvas: {
    box: "size-11",
    glyph: textVariants({ role: "entity", weight: "medium" }),
    square: "rounded-sm border",
    elevation: "shadow-xs",
  },
}

function CircleMarker({ tone, spec, children, accessibility }: MarkerViewProps) {
  return (
    <span
      {...accessibility}
      data-tone={tone}
      className={cn(
        "grid shrink-0 place-items-center rounded-full border-[1.5px] border-tone bg-card text-tone-fg",
        spec.box,
        spec.elevation,
        spec.glyph,
      )}
    >
      {children}
    </span>
  )
}

function DiamondMarker({ tone, spec, children, accessibility }: MarkerViewProps) {
  return (
    <span {...accessibility} data-tone={tone} className={cn("relative shrink-0", spec.box)}>
      <span className={cn("absolute inset-0 rotate-45 border-tone bg-card", spec.square, spec.elevation)} />
      <span className={cn("absolute inset-0 grid place-items-center text-tone", spec.glyph)}>{children}</span>
    </span>
  )
}

function EndMarker({ tone, spec, accessibility }: MarkerViewProps) {
  return (
    <span
      {...accessibility}
      data-tone={tone}
      className={cn(
        "grid shrink-0 place-items-center rounded-full border border-dashed border-border bg-card text-muted-foreground",
        spec.box,
        spec.elevation,
        spec.glyph,
      )}
    >
      {END_GLYPH}
    </span>
  )
}

const MARKER_VIEW: Readonly<Record<MarkerShape, (props: MarkerViewProps) => ReactNode>> = {
  circle: CircleMarker,
  diamond: DiamondMarker,
  end: EndMarker,
}

const accessibilityOf = (label: string | undefined): MarkerAccessibility =>
  label === undefined ? { "aria-hidden": true } : { role: "img", "aria-label": label }

export function Marker({ shape, tone, size = "md", children, label }: MarkerProps) {
  const View = MARKER_VIEW[shape]
  return (
    <View tone={tone} spec={MARKER_SIZE[size]} accessibility={accessibilityOf(label)}>
      {children}
    </View>
  )
}
