import {
  COLLAPSED_HEIGHT,
  COLLAPSED_WIDTH,
  FAN_HEIGHT,
  FAN_WIDTH,
  NESTED_HEIGHT,
  NODE_BASE_HEIGHT,
  NODE_WIDTH,
  layoutNested,
} from "./layout.js"
import type { GraphLabel } from "@dagrejs/dagre"
import type { ExpandedEdge, ExpandedGraph, ExpandedNode } from "./expand.js"
import type { Layout, LayoutNode, Size } from "./layout.js"

export type CanvasKind = "wf" | "fan" | "wfgroup"

export type Placement = {
  visible: ExpandedNode[]
  edges: ExpandedEdge[]
  layout: Layout
  sized: Set<string>
}

const FAN_KINDS = new Set(["fanout", "fanin"])

export const isFan = (node: ExpandedNode): boolean => FAN_KINDS.has(node.kind)

export const canvasKindOf = (node: ExpandedNode): CanvasKind => {
  if (isFan(node)) return "fan"
  return node.group === null ? "wf" : "wfgroup"
}

export const fallbackSize = (node: ExpandedNode, collapsed: boolean): Size => {
  if (isFan(node)) return { width: FAN_WIDTH, height: FAN_HEIGHT }
  if (node.group !== null && collapsed) return { width: COLLAPSED_WIDTH, height: COLLAPSED_HEIGHT }
  const extra = node.info.nested === null ? 0 : NESTED_HEIGHT
  return { width: NODE_WIDTH, height: NODE_BASE_HEIGHT + extra }
}

export const hiddenUnder = (graph: ExpandedGraph, collapsed: ReadonlySet<string>): Set<string> => {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const hidden = new Set<string>()
  const buried = (node: ExpandedNode): boolean => {
    let cursor = node.parentId
    while (cursor !== null) {
      if (collapsed.has(cursor)) return true
      cursor = byId.get(cursor)?.parentId ?? null
    }
    return false
  }
  for (const node of graph.nodes) if (buried(node)) hidden.add(node.id)
  return hidden
}

export const placeGraph = (
  graph: ExpandedGraph,
  collapsed: ReadonlySet<string>,
  measured: ReadonlyMap<string, Size>,
  options: Partial<GraphLabel> = {},
): Placement => {
  const hidden = hiddenUnder(graph, collapsed)
  const visible = graph.nodes.filter((node) => !hidden.has(node.id))
  const shown = new Set(visible.map((node) => node.id))

  const layoutNodes: LayoutNode[] = visible.map((node) => ({
    id: node.id,
    parentId: node.parentId,
    fallback: fallbackSize(node, collapsed.has(node.id)),
  }))
  const edges = graph.edges.filter((edge) => shown.has(edge.source) && shown.has(edge.target))

  const sized = new Set(visible.filter((node) => node.group === null).map((node) => node.id))
  const useful = new Map([...measured].filter(([id]) => sized.has(id)))

  return { visible, edges, layout: layoutNested(layoutNodes, edges, useful, options), sized }
}

export const groupIdsOf = (graph: ExpandedGraph): string[] =>
  graph.nodes.filter((node) => node.group !== null).map((node) => node.id)

export const collapsibleIdsOf = (graph: ExpandedGraph): string[] =>
  graph.nodes.filter((node) => node.group !== null && node.group.leaves > 1).map((node) => node.id)
