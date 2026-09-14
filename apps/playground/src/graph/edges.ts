import { MarkerType } from "@xyflow/react"
import { IN_PORT, OUT_PORT, slotPort } from "./ports.js"
import type { Edge } from "@xyflow/react"
import type { Point } from "./edge-route.js"
import type { EdgeKind, ExpandedEdge } from "./expand.js"

export type EdgeVariant = EdgeKind | "loopback" | "boundary"

export type EdgeLook = {
  title: string
  color: string
  width: number
  dash?: string
  animated: boolean
}

export type EdgeRoute = {
  points?: readonly Point[]
  variant?: EdgeVariant
  slot?: string
}

export type RoutedEdge = ExpandedEdge & EdgeRoute

export type WfEdgeType = "ortho" | "branch"

export type WfEdgeData = {
  variant: EdgeVariant
  title: string
  color: string
  text: string
  points: readonly Point[]
}

export type WfEdge = Edge<WfEdgeData, WfEdgeType>

const looks: Record<EdgeVariant, EdgeLook> = {
  data: { title: "поток данных", color: "#64748b", width: 1.6, animated: false },
  branch: { title: "переход ветки switch", color: "#fb923c", width: 1.8, dash: "7 4", animated: false },
  fanout: {
    title: "разветвление на параллельные вызовы",
    color: "#2dd4bf",
    width: 2.2,
    animated: true,
  },
  fanin: { title: "сведение параллельных ветвей", color: "#2dd4bf", width: 2.2, animated: false },
  loop: { title: "вход в тело цикла", color: "#f472b6", width: 1.8, dash: "3 4", animated: true },
  loopback: {
    title: "обратное ребро цикла",
    color: "#f472b6",
    width: 1.8,
    dash: "1 6",
    animated: false,
  },
  boundary: { title: "граница компонента", color: "#94a3b8", width: 1.4, dash: "12 6", animated: false },
}

const LOOP_ENTRY_SUFFIX = "/split"

const SOURCE_LABELLED: ReadonlySet<EdgeVariant> = new Set<EdgeVariant>([
  "branch",
  "fanout",
  "loop",
  "loopback",
])

const backEdge = (edge: ExpandedEdge): boolean =>
  edge.kind === "loop" && edge.target.endsWith(LOOP_ENTRY_SUFFIX)

export const edgeVariant = (edge: RoutedEdge): EdgeVariant => {
  if (edge.variant !== undefined) return edge.variant
  if (backEdge(edge)) return "loopback"
  return edge.kind
}

export const edgeLook = (variant: EdgeVariant): EdgeLook => looks[variant]

export const edgeLegend: readonly (EdgeLook & { kind: EdgeVariant })[] = (
  Object.keys(looks) as EdgeVariant[]
).map((variant) => ({ kind: variant, ...looks[variant] }))

const edgeTypeOf = (variant: EdgeVariant, label: string): WfEdgeType =>
  label !== "" && SOURCE_LABELLED.has(variant) ? "branch" : "ortho"

const targetPortOf = (edge: RoutedEdge): string =>
  edge.slot === undefined || edge.slot === "" ? IN_PORT : slotPort(edge.slot)

export const toFlowEdge = (edge: RoutedEdge): WfEdge => {
  const variant = edgeVariant(edge)
  const look = edgeLook(variant)
  const label = edge.label
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: OUT_PORT,
    targetHandle: targetPortOf(edge),
    type: edgeTypeOf(variant, label),
    animated: look.animated,
    zIndex: 2,
    data: {
      variant,
      title: look.title,
      color: look.color,
      text: label,
      points: edge.points ?? [],
    },
    style: { stroke: look.color, strokeWidth: look.width, strokeDasharray: look.dash },
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: look.color },
  }
}
