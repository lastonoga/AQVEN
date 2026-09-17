import type { CSSProperties } from "react"
import type { SchemaEdge } from "@/domain"
import type { Tone } from "@/components/studio"

export type EdgeVariant = SchemaEdge["variant"]

type EdgeFields = {
  readonly flow: { readonly detourY?: never }
  readonly back: { readonly detourY: number | null }
}

export type FlowEdgeData<K extends EdgeVariant = EdgeVariant> = {
  [P in K]: { readonly variant: P; readonly label: string | null } & EdgeFields[P]
}[K]

const STROKE_WIDTH = 1.25

export const EDGE_COLOR: Readonly<Record<EdgeVariant, string>> = {
  flow: "var(--ring)",
  back: "var(--loop)",
}

export const EDGE_STYLE: Readonly<Record<EdgeVariant, CSSProperties>> = {
  flow: { stroke: EDGE_COLOR.flow, strokeWidth: STROKE_WIDTH, strokeLinecap: "round" },
  back: { stroke: EDGE_COLOR.back, strokeWidth: STROKE_WIDTH, strokeLinecap: "round", strokeDasharray: "7 5" },
}

export const LABEL_TONE: Readonly<Record<EdgeVariant, Tone>> = {
  flow: "neutral",
  back: "loop",
}
