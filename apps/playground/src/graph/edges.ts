import { MarkerType } from "@xyflow/react"
import { IN_PORT, OUT_PORT, slotPort } from "./ports.js"
import { edgeChain, labelObstacles, placeLabels } from "./edge-label.js"
import type { Edge } from "@xyflow/react"
import type { EdgeAnchor, Point } from "./edge-route.js"
import type { LabelTarget, Placed } from "./edge-label.js"
import type { EdgeKind, ExpandedEdge } from "./expand.js"
import type { Rect } from "./layout.js"

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

export type LabelSpot = Placed | null

export type WfEdgeData = {
  variant: EdgeVariant
  title: string
  color: string
  text: string
  points: readonly Point[]
  label?: LabelSpot
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isPoint = (value: unknown): value is Point =>
  isRecord(value) && typeof value["x"] === "number" && typeof value["y"] === "number"

const pointsOf = (value: unknown): Point[] => (Array.isArray(value) ? value.filter(isPoint) : [])

const chainsOf = (targets: readonly LabelTarget[]): Map<string, readonly Point[]> =>
  new Map(targets.map((target) => [target.id, target.chain]))

const labelAnchor = (edge: Edge): EdgeAnchor => (edge.type === "branch" ? "source" : "center")

const labelTargetOf = (edge: Edge, rects: ReadonlyMap<string, Rect>): LabelTarget[] => {
  const data = edge.data
  if (!isRecord(data)) return []
  const text = data["text"]
  if (typeof text !== "string" || text === "") return []
  const source = rects.get(edge.source)
  const target = rects.get(edge.target)
  if (source === undefined || target === undefined) return []
  const chain = edgeChain(source, target, pointsOf(data["points"]))
  return [{ id: edge.id, text, anchor: labelAnchor(edge), chain }]
}

export const labelTargets = (
  edges: readonly Edge[],
  rects: ReadonlyMap<string, Rect>,
): LabelTarget[] => edges.flatMap((edge) => labelTargetOf(edge, rects))

export const labelEdges = (
  edges: readonly Edge[],
  rects: ReadonlyMap<string, Rect>,
  frames: ReadonlySet<string>,
): Edge[] => {
  const targets = labelTargets(edges, rects)
  const spots = placeLabels(targets, labelObstacles(rects, frames), chainsOf(targets))
  return edges.map((edge) => {
    if (!spots.has(edge.id)) return edge
    return { ...edge, data: { ...edge.data, label: spots.get(edge.id) ?? null } }
  })
}

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
