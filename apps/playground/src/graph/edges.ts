import { MarkerType } from "@xyflow/react"
import type { Edge } from "@xyflow/react"
import type { EdgeKind, ExpandedEdge } from "./expand.js"

export type EdgeLook = {
  title: string
  color: string
  width: number
  dash?: string
  animated: boolean
  type: string
}

const looks: Record<EdgeKind, EdgeLook> = {
  data: { title: "поток данных", color: "#64748b", width: 1.6, animated: false, type: "default" },
  branch: {
    title: "ветка switch",
    color: "#fb923c",
    width: 1.8,
    dash: "7 4",
    animated: false,
    type: "smoothstep",
  },
  fanout: {
    title: "разветвление на параллельные вызовы",
    color: "#2dd4bf",
    width: 2.2,
    animated: true,
    type: "smoothstep",
  },
  fanin: {
    title: "сведение параллельных ветвей",
    color: "#2dd4bf",
    width: 2.2,
    animated: false,
    type: "smoothstep",
  },
  loop: {
    title: "вход в тело цикла",
    color: "#f472b6",
    width: 1.8,
    dash: "3 4",
    animated: true,
    type: "smoothstep",
  },
}

export const edgeLook = (kind: EdgeKind): EdgeLook => looks[kind]

export const edgeLegend: readonly (EdgeLook & { kind: EdgeKind })[] = (
  Object.keys(looks) as EdgeKind[]
).map((kind) => ({ kind, ...looks[kind] }))

const labelStyle = { fill: "#cbd5e1", fontSize: 10, fontFamily: "ui-monospace, monospace" }

const labelBgStyle = { fill: "#020617", fillOpacity: 0.85 }

export const toFlowEdge = (edge: ExpandedEdge): Edge => {
  const look = edgeLook(edge.kind)
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: look.type,
    animated: look.animated,
    label: edge.label === "" ? undefined : edge.label,
    labelStyle,
    labelBgStyle,
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 3,
    style: { stroke: look.color, strokeWidth: look.width, strokeDasharray: look.dash },
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: look.color },
  }
}
