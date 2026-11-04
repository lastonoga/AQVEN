import type { CSSProperties } from "react"
import type { Tone } from "@/components/studio"
import type { EdgeVariant, Point } from "../layout"

export type FlowEdgeData<K extends EdgeVariant = EdgeVariant> = {
  readonly variant: K
  readonly label: string | null
  readonly points: readonly Point[]
}

export type FlowEdgeRenderData<K extends EdgeVariant = EdgeVariant> = FlowEdgeData<K> & { readonly color: string }

const STROKE_WIDTH = 1.5

const DASH: Readonly<Record<EdgeVariant, string | undefined>> = {
  flow: undefined,
  back: "7 5",
}

export const edgeStyle = (variant: EdgeVariant, color: string): CSSProperties => ({
  stroke: color,
  strokeWidth: STROKE_WIDTH,
  strokeLinecap: "round",
  strokeDasharray: DASH[variant],
})

export const LABEL_TONE: Readonly<Record<EdgeVariant, Tone>> = {
  flow: "neutral",
  back: "loop",
}
