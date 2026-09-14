import dagre from "@dagrejs/dagre"
import type { EdgeLabel, GraphLabel, NodeLabel } from "@dagrejs/dagre"

export const NODE_WIDTH = 224
export const NODE_BASE_HEIGHT = 150
export const NESTED_HEIGHT = 56
export const FAN_WIDTH = 148
export const FAN_HEIGHT = 66
export const COLLAPSED_WIDTH = 264
export const COLLAPSED_HEIGHT = 112
export const GROUP_PAD = 18
export const GROUP_HEADER = 40
export const NODE_SEP = 30
export const RANK_SEP = 56
export const COLUMN_GAP = 18

export type Point = { x: number; y: number }
export type Size = { width: number; height: number }
export type Rect = Point & Size

export type LayoutNode = {
  id: string
  parentId: string | null
  fallback: Size
}

export type LayoutEdge = {
  source: string
  target: string
}

export type Layout = {
  offsets: Map<string, Point>
  rects: Map<string, Rect>
  sizes: Map<string, Size>
  bounds: Rect
}

export type ColumnBox = Rect & { rank: number }

type Level = { size: Size; offsets: Map<string, Point> }

const EMPTY_LEVEL: Level = { size: { width: 0, height: 0 }, offsets: new Map() }

const GRAPH_OPTIONS: GraphLabel = {
  rankdir: "LR",
  ranker: "longest-path",
  acyclicer: "greedy",
  nodesep: NODE_SEP,
  ranksep: RANK_SEP,
  marginx: 0,
  marginy: 0,
}

const layoutLevel = (
  ids: readonly string[],
  edges: readonly LayoutEdge[],
  sizeOf: (id: string) => Size,
): Level => {
  if (ids.length === 0) return EMPTY_LEVEL

  const graph = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ ...GRAPH_OPTIONS })

  const inside = new Set(ids)
  for (const id of ids) {
    const size = sizeOf(id)
    graph.setNode(id, { width: size.width, height: size.height })
  }
  for (const edge of edges) {
    if (edge.source === edge.target) continue
    if (!inside.has(edge.source) || !inside.has(edge.target)) continue
    graph.setEdge(edge.source, edge.target)
  }

  dagre.layout(graph)

  const corners = new Map<string, Point>()
  for (const id of ids) {
    const placed = graph.node(id)
    const size = sizeOf(id)
    corners.set(id, { x: (placed.x ?? 0) - size.width / 2, y: (placed.y ?? 0) - size.height / 2 })
  }

  const left = Math.min(...[...corners.values()].map((point) => point.x))
  const top = Math.min(...[...corners.values()].map((point) => point.y))
  const right = Math.max(...ids.map((id) => (corners.get(id)?.x ?? 0) + sizeOf(id).width))
  const bottom = Math.max(...ids.map((id) => (corners.get(id)?.y ?? 0) + sizeOf(id).height))

  const offsets = new Map<string, Point>()
  for (const [id, point] of corners) offsets.set(id, { x: point.x - left, y: point.y - top })

  return { size: { width: right - left, height: bottom - top }, offsets }
}

const childrenIndex = (nodes: readonly LayoutNode[]): Map<string | null, string[]> => {
  const children = new Map<string | null, string[]>()
  for (const node of nodes) {
    const bucket = children.get(node.parentId) ?? []
    bucket.push(node.id)
    children.set(node.parentId, bucket)
  }
  return children
}

export const layoutNested = (
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  measured: ReadonlyMap<string, Size>,
): Layout => {
  const children = childrenIndex(nodes)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const sizes = new Map<string, Size>()
  const offsets = new Map<string, Point>()

  const leafSize = (id: string): Size => {
    const seen = measured.get(id)
    if (seen !== undefined && seen.width > 0 && seen.height > 0) return seen
    return byId.get(id)?.fallback ?? { width: NODE_WIDTH, height: NODE_BASE_HEIGHT }
  }

  const sizeOf = (id: string): Size => {
    const cached = sizes.get(id)
    if (cached !== undefined) return cached
    const kids = children.get(id) ?? []
    if (kids.length === 0) {
      const size = leafSize(id)
      sizes.set(id, size)
      return size
    }
    const level = layoutLevel(kids, edges, sizeOf)
    for (const [kid, point] of level.offsets) {
      offsets.set(kid, { x: point.x + GROUP_PAD, y: point.y + GROUP_HEADER })
    }
    const size = {
      width: level.size.width + GROUP_PAD * 2,
      height: level.size.height + GROUP_HEADER + GROUP_PAD,
    }
    sizes.set(id, size)
    return size
  }

  const roots = children.get(null) ?? []
  const top = layoutLevel(roots, edges, sizeOf)
  for (const [id, point] of top.offsets) offsets.set(id, point)

  const rects = new Map<string, Rect>()
  const place = (id: string, originX: number, originY: number): void => {
    const offset = offsets.get(id) ?? { x: 0, y: 0 }
    const size = sizeOf(id)
    const x = originX + offset.x
    const y = originY + offset.y
    rects.set(id, { x, y, width: size.width, height: size.height })
    for (const kid of children.get(id) ?? []) place(kid, x, y)
  }
  for (const id of roots) place(id, 0, 0)

  return { offsets, rects, sizes, bounds: { x: 0, y: 0, ...top.size } }
}

export const columnsOf = (
  rects: ReadonlyMap<string, Rect>,
  rankOf: ReadonlyMap<string, number>,
  roots: readonly string[],
): ColumnBox[] => {
  const byRank = new Map<number, Rect[]>()
  for (const id of roots) {
    const rect = rects.get(id)
    if (rect === undefined) continue
    const rank = rankOf.get(id) ?? 0
    const bucket = byRank.get(rank) ?? []
    bucket.push(rect)
    byRank.set(rank, bucket)
  }
  if (byRank.size === 0) return []

  const all = [...byRank.values()].flat()
  const top = Math.min(...all.map((rect) => rect.y)) - COLUMN_GAP
  const bottom = Math.max(...all.map((rect) => rect.y + rect.height)) + COLUMN_GAP

  return [...byRank.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([rank, group]) => {
      const left = Math.min(...group.map((rect) => rect.x)) - COLUMN_GAP / 2
      const right = Math.max(...group.map((rect) => rect.x + rect.width)) + COLUMN_GAP / 2
      return { rank, x: left, y: top, width: right - left, height: bottom - top }
    })
}

export const overlaps = (left: Rect, right: Rect): boolean =>
  left.x < right.x + right.width &&
  right.x < left.x + left.width &&
  left.y < right.y + right.height &&
  right.y < left.y + left.height

export const contains = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height
