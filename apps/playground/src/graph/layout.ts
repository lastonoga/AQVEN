import dagre from "@dagrejs/dagre"
import { channelRoutes } from "./channels.js"
import { bypass, clean } from "./reroute.js"
import {
  COLUMN_GAP,
  CROSS_PAD,
  EDGE_SEP,
  GRAPH_MARGIN,
  GROUP_HEADER,
  GROUP_NEST,
  GROUP_PAD,
  NODE_BASE_HEIGHT,
  NODE_SEP,
  NODE_WIDTH,
  RANK_PAD,
  RANK_SEP,
} from "./metrics.js"
import type { EdgeLabel, GraphLabel, NodeLabel } from "@dagrejs/dagre"
import type { Wire } from "./channels.js"
import type { Point, Rect, Size } from "./metrics.js"

export * from "./metrics.js"

export type FramePad = { top: number; bottom: number; side: number }

const LEAF_PAD: FramePad = { top: GROUP_HEADER, bottom: GROUP_PAD, side: GROUP_PAD }

const NESTED_PAD: FramePad = {
  top: GROUP_HEADER + GROUP_NEST,
  bottom: GROUP_PAD + GROUP_NEST,
  side: GROUP_PAD + GROUP_NEST,
}

export const framePadOf = (nested: boolean): FramePad => (nested ? NESTED_PAD : LEAF_PAD)

export type LayoutNode = {
  id: string
  parentId: string | null
  fallback: Size
}

export type LayoutEdge = {
  id: string
  source: string
  target: string
}

export type Layout = {
  offsets: Map<string, Point>
  rects: Map<string, Rect>
  sizes: Map<string, Size>
  routes: Map<string, Point[]>
  bounds: Rect
}

export type ColumnBox = Rect & { rank: number }

export const GRAPH_OPTIONS: GraphLabel = {
  rankdir: "LR",
  ranker: "network-simplex",
  rankalign: "center",
  align: "UR",
  acyclicer: "greedy",
  nodesep: NODE_SEP,
  edgesep: EDGE_SEP,
  ranksep: RANK_SEP,
  marginx: GRAPH_MARGIN,
  marginy: GRAPH_MARGIN,
}

const EMPTY_LAYOUT: Layout = {
  offsets: new Map(),
  rects: new Map(),
  sizes: new Map(),
  routes: new Map(),
  bounds: { x: 0, y: 0, width: 0, height: 0 },
}

type Tree = {
  byId: Map<string, LayoutNode>
  children: Map<string, string[]>
  depth: Map<string, number>
}

const treeOf = (nodes: readonly LayoutNode[]): Tree => {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const children = new Map<string, string[]>()
  for (const node of nodes) {
    if (node.parentId === null) continue
    const bucket = children.get(node.parentId) ?? []
    bucket.push(node.id)
    children.set(node.parentId, bucket)
  }

  const depth = new Map<string, number>()
  const depthOf = (id: string): number => {
    const seen = depth.get(id)
    if (seen !== undefined) return seen
    const parentId = byId.get(id)?.parentId ?? null
    const own = parentId === null ? 0 : depthOf(parentId) + 1
    depth.set(id, own)
    return own
  }
  for (const node of nodes) depthOf(node.id)

  return { byId, children, depth }
}

const lineage = (tree: Tree, id: string): Set<string> => {
  const chain = new Set<string>()
  let cursor = tree.byId.get(id)?.parentId ?? null
  while (cursor !== null) {
    chain.add(cursor)
    cursor = tree.byId.get(cursor)?.parentId ?? null
  }
  return chain
}

const routable = (tree: Tree, edge: LayoutEdge): boolean => {
  if (edge.source === edge.target) return false
  if (!tree.byId.has(edge.source) || !tree.byId.has(edge.target)) return false
  if (lineage(tree, edge.source).has(edge.target)) return false
  return !lineage(tree, edge.target).has(edge.source)
}

type Port = { entry: string; exit: string }

type Link = LayoutEdge & { from: string; to: string }

const descendantsOf = (tree: Tree): Map<string, string[]> => {
  const nested = new Map<string, string[]>()
  for (const id of tree.byId.keys()) {
    for (const ancestor of lineage(tree, id)) {
      const bucket = nested.get(ancestor) ?? []
      bucket.push(id)
      nested.set(ancestor, bucket)
    }
  }
  return nested
}

const endpointOf = (tree: Tree, ports: ReadonlyMap<string, Port>, id: string, side: keyof Port): string => {
  if ((tree.children.get(id) ?? []).length === 0) return id
  return ports.get(id)?.[side] ?? id
}

const kinOf = (tree: Tree): Map<string, Set<string>> => {
  const nested = descendantsOf(tree)
  const kin = new Map<string, Set<string>>()
  for (const id of tree.byId.keys()) {
    kin.set(id, new Set([id, ...lineage(tree, id), ...(nested.get(id) ?? [])]))
  }
  return kin
}

const portsOf = (tree: Tree, edges: readonly LayoutEdge[]): Map<string, Port> => {
  const ports = new Map<string, Port>()
  const nested = descendantsOf(tree)
  const deepestFirst = [...nested.keys()].sort(
    (left, right) => (tree.depth.get(right) ?? 0) - (tree.depth.get(left) ?? 0),
  )
  for (const cluster of deepestFirst) {
    const inside = nested.get(cluster) ?? []
    const within = new Set(inside)
    const leaves = inside.filter((id) => (tree.children.get(id) ?? []).length === 0)
    const first = leaves[0]
    if (first === undefined) continue
    const internal = edges.filter((edge) => within.has(edge.source) && within.has(edge.target))
    const fed = new Set(internal.map((edge) => endpointOf(tree, ports, edge.target, "entry")))
    const drained = new Set(internal.map((edge) => endpointOf(tree, ports, edge.source, "exit")))
    ports.set(cluster, {
      entry: leaves.find((id) => !fed.has(id)) ?? first,
      exit: leaves.find((id) => !drained.has(id)) ?? first,
    })
  }
  return ports
}

const linksOf = (tree: Tree, edges: readonly LayoutEdge[]): Link[] => {
  const routes = edges.filter((edge) => routable(tree, edge))
  const ports = portsOf(tree, routes)
  return routes
    .map((edge) => ({
      ...edge,
      from: endpointOf(tree, ports, edge.source, "exit"),
      to: endpointOf(tree, ports, edge.target, "entry"),
    }))
    .filter((link) => link.from !== link.to)
}

type Inset = { top: number; bottom: number; left: number; right: number }

const NO_INSET: Inset = { top: 0, bottom: 0, left: 0, right: 0 }

const boxOf = (size: Size, inset: Inset): Size => ({
  width: size.width + inset.left + inset.right,
  height: size.height + inset.top + inset.bottom,
})

const shortfall = (need: number, given: number): number => Math.max(0, need - given)

const insetAt = (depth: number): Inset => {
  if (depth === 0) return NO_INSET
  const outer = depth - 1
  const own = framePadOf(false)
  const nest = framePadOf(true)
  const side = shortfall(own.side, RANK_PAD) + shortfall(nest.side, RANK_PAD) * outer
  return {
    top: shortfall(own.top, CROSS_PAD) + shortfall(nest.top, CROSS_PAD) * outer,
    bottom: shortfall(own.bottom, CROSS_PAD) + shortfall(nest.bottom, CROSS_PAD) * outer,
    left: side,
    right: side,
  }
}

const insetsOf = (nodes: readonly LayoutNode[], tree: Tree): Map<string, Inset> => {
  const insets = new Map<string, Inset>()
  for (const node of nodes) {
    const leaf = (tree.children.get(node.id) ?? []).length === 0
    insets.set(node.id, leaf ? insetAt(tree.depth.get(node.id) ?? 0) : NO_INSET)
  }
  return insets
}

const compoundGraph = (
  nodes: readonly LayoutNode[],
  links: readonly Link[],
  tree: Tree,
  sizeOf: (id: string) => Size,
  insets: ReadonlyMap<string, Inset>,
  options: Partial<GraphLabel>,
) => {
  const graph = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>({
    compound: true,
    multigraph: true,
  })
  graph.setGraph({ ...GRAPH_OPTIONS, ...options })
  graph.setDefaultEdgeLabel(() => ({}))

  for (const node of nodes) {
    const kids = tree.children.get(node.id) ?? []
    if (kids.length > 0) graph.setNode(node.id, { width: 0, height: 0 })
    else graph.setNode(node.id, { ...boxOf(sizeOf(node.id), insets.get(node.id) ?? NO_INSET) })
  }
  for (const node of nodes) {
    if (node.parentId === null) continue
    graph.setParent(node.id, node.parentId)
  }
  for (const link of links) graph.setEdge(link.from, link.to, {}, link.id)

  return graph
}

type Kid = { rect: Rect; pad: FramePad }

const frameAround = (kids: readonly Kid[]): Rect => {
  const left = Math.min(...kids.map((kid) => kid.rect.x - kid.pad.side))
  const right = Math.max(...kids.map((kid) => kid.rect.x + kid.rect.width + kid.pad.side))
  const top = Math.min(...kids.map((kid) => kid.rect.y - kid.pad.top))
  const bottom = Math.max(...kids.map((kid) => kid.rect.y + kid.rect.height + kid.pad.bottom))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

const kidsOf = (tree: Tree, rects: ReadonlyMap<string, Rect>, id: string): Kid[] =>
  (tree.children.get(id) ?? []).flatMap((kid) => {
    const rect = rects.get(kid)
    if (rect === undefined) return []
    return [{ rect, pad: framePadOf((tree.children.get(kid) ?? []).length > 0) }]
  })

const growFrames = (nodes: readonly LayoutNode[], tree: Tree, rects: Map<string, Rect>): void => {
  const deepestFirst = [...nodes].sort(
    (left, right) => (tree.depth.get(right.id) ?? 0) - (tree.depth.get(left.id) ?? 0),
  )
  for (const node of deepestFirst) {
    const kids = kidsOf(tree, rects, node.id)
    if (kids.length === 0) continue
    rects.set(node.id, frameAround(kids))
  }
}

const shift = (point: Point, origin: Point): Point => ({ x: point.x - origin.x, y: point.y - origin.y })

const covers = (rect: Rect, point: Point): boolean =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height

const squared = (corridor: readonly Point[], start: Point, end: Point): Point[] => {
  const first = corridor[0]
  const last = corridor[corridor.length - 1]
  if (first === undefined || last === undefined) return [start, end]
  const head = first.y === start.y ? [] : [{ x: first.x, y: start.y }]
  const tail = last.y === end.y ? [] : [{ x: last.x, y: end.y }]
  return [start, ...head, ...corridor, ...tail, end]
}

const trimmed = (points: readonly Point[], source: Rect, target: Rect): Point[] => {
  const corridor = points
    .slice(1, -1)
    .filter((point) => !covers(source, point) && !covers(target, point))
  return squared(
    corridor,
    { x: source.x + source.width, y: source.y + source.height / 2 },
    { x: target.x, y: target.y + target.height / 2 },
  )
}

const wiresOf = (links: readonly Link[], rects: ReadonlyMap<string, Rect>): Wire[] =>
  links.flatMap((link) => {
    const source = rects.get(link.source)
    const target = rects.get(link.target)
    if (source === undefined || target === undefined) return []
    return [{ id: link.id, source, target }]
  })

const usableChannel = (path: readonly Point[] | undefined, obstacles: readonly Rect[]): Point[] | null => {
  if (path === undefined) return null
  return clean(path, obstacles) ? [...path] : null
}

const originOf = (rects: ReadonlyMap<string, Rect>, routes: ReadonlyMap<string, Point[]>): Point => {
  const corners = [...rects.values()].map((rect) => ({ x: rect.x, y: rect.y }))
  const waypoints = [...routes.values()].flat()
  const all = [...corners, ...waypoints]
  if (all.length === 0) return { x: 0, y: 0 }
  return {
    x: Math.min(...all.map((point) => point.x)) - GRAPH_MARGIN,
    y: Math.min(...all.map((point) => point.y)) - GRAPH_MARGIN,
  }
}

const extentOf = (rects: ReadonlyMap<string, Rect>): Size => {
  const boxes = [...rects.values()]
  if (boxes.length === 0) return { width: 0, height: 0 }
  return {
    width: Math.max(...boxes.map((rect) => rect.x + rect.width)) + GRAPH_MARGIN,
    height: Math.max(...boxes.map((rect) => rect.y + rect.height)) + GRAPH_MARGIN,
  }
}

export const layoutNested = (
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  measured: ReadonlyMap<string, Size>,
  options: Partial<GraphLabel> = {},
): Layout => {
  if (nodes.length === 0) return EMPTY_LAYOUT

  const tree = treeOf(nodes)
  const sizeOf = (id: string): Size => {
    const seen = measured.get(id)
    if (seen !== undefined && seen.width > 0 && seen.height > 0) return seen
    return tree.byId.get(id)?.fallback ?? { width: NODE_WIDTH, height: NODE_BASE_HEIGHT }
  }

  const links = linksOf(tree, edges)
  const insets = insetsOf(nodes, tree)
  const graph = compoundGraph(nodes, links, tree, sizeOf, insets, options)
  dagre.layout(graph)

  const rects = new Map<string, Rect>()
  for (const node of nodes) {
    const placed = graph.node(node.id)
    const inset = insets.get(node.id) ?? NO_INSET
    const fallback = boxOf(sizeOf(node.id), inset)
    const width = placed.width > 0 ? placed.width : fallback.width
    const height = placed.height > 0 ? placed.height : fallback.height
    rects.set(node.id, {
      x: (placed.x ?? 0) - width / 2 + inset.left,
      y: (placed.y ?? 0) - height / 2 + inset.top,
      width: width - inset.left - inset.right,
      height: height - inset.top - inset.bottom,
    })
  }
  growFrames(nodes, tree, rects)

  const kin = kinOf(tree)
  const channels = channelRoutes(wiresOf(links, rects))
  const routes = new Map<string, Point[]>()
  for (const link of links) {
    const points = graph.edge(link.from, link.to, link.id).points
    const source = rects.get(link.source)
    const target = rects.get(link.target)
    if (points === undefined || source === undefined || target === undefined) continue
    const skip = new Set([...(kin.get(link.source) ?? []), ...(kin.get(link.target) ?? [])])
    const obstacles = [...rects].flatMap(([id, rect]) => (skip.has(id) ? [] : [rect]))
    const normalized = usableChannel(channels.get(link.id), obstacles)
    routes.set(link.id, normalized ?? bypass(trimmed(points, source, target), obstacles))
  }

  const origin = originOf(rects, routes)
  for (const [id, rect] of rects) rects.set(id, { ...rect, ...shift(rect, origin) })
  for (const [id, points] of routes) routes.set(id, points.map((point) => shift(point, origin)))

  const offsets = new Map<string, Point>()
  const sizes = new Map<string, Size>()
  for (const node of nodes) {
    const rect = rects.get(node.id)
    if (rect === undefined) continue
    const parent = node.parentId === null ? null : rects.get(node.parentId) ?? null
    offsets.set(node.id, parent === null ? { x: rect.x, y: rect.y } : shift(rect, parent))
    sizes.set(node.id, { width: rect.width, height: rect.height })
  }

  return { offsets, rects, sizes, routes, bounds: { x: 0, y: 0, ...extentOf(rects) } }
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
