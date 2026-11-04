import ELK, { type ElkExtendedEdge, type ElkNode, type ElkPort } from "elkjs/lib/elk.bundled.js"
import type { ApiNode, NodeKind } from "@/domain"
import { nodeSubtitle } from "./node-facts"

export type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export type Point = { readonly x: number; readonly y: number }
export type CanvasSize = "md" | "sm"
export type EdgeVariant = "flow" | "back"

type CanvasCommon = {
  readonly id: string
  readonly parent: string | null
  readonly box: Box
  readonly size: CanvasSize
  readonly kind: NodeKind
  readonly name: string
  readonly problems: number
}

export type CanvasStep = CanvasCommon & {
  readonly role: "step"
  readonly meta: string
  readonly inputs: number
  readonly outputs: number
}

export type CanvasContainer = CanvasCommon & {
  readonly role: "container"
  readonly members: number
}

export type CanvasNode = CanvasStep | CanvasContainer

export type CanvasEdge = {
  readonly id: string
  readonly source: string
  readonly target: string
  readonly variant: EdgeVariant
  readonly points: readonly Point[]
}

export type Port = { readonly id: string; readonly offset: number; readonly edgeId: string }
export type NodePorts = { readonly in: readonly Port[]; readonly out: readonly Port[]; readonly bottom: readonly Port[] }

export type CanvasGraph = {
  readonly nodes: readonly CanvasNode[]
  readonly edges: readonly CanvasEdge[]
  readonly ports: ReadonlyMap<string, NodePorts>
  readonly extent: Box
}

type Size = { readonly width: number; readonly height: number }
type Pair = { readonly source: string; readonly target: string }
type RoutedEdge = Pair & { readonly id: string; readonly variant: EdgeVariant; readonly level: string | null }

const STEP_SIZE: Readonly<Record<CanvasSize, Size>> = {
  md: { width: 240, height: 92 },
  sm: { width: 220, height: 84 },
}

const CONTAINER_HEADER = 36
const CONTAINER_PADDING = 14
const LOOP_SIDE = 34
const LOOP_FOOT = 40
const RANK_GAP = 72
const STACK_GAP = 24
const COMPONENT_GAP = 48

const OUT_PREFIX = "out-"
const IN_PREFIX = "in-"
const BOTTOM_PORT = "bottom"

const ROOT_OPTIONS: Readonly<Record<string, string>> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.spacing.nodeNode": String(STACK_GAP),
  "elk.layered.spacing.nodeNodeBetweenLayers": String(RANK_GAP),
  "elk.spacing.componentSpacing": String(COMPONENT_GAP),
  "elk.spacing.edgeNode": "14",
  "elk.layered.spacing.edgeNodeBetweenLayers": "24",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
}

const FIXED_SIDE_PORTS: Readonly<Record<string, string>> = { "elk.portConstraints": "FIXED_SIDE" }

const elk = new ELK()

type ElkInput = ElkNode & { readonly children: ElkNode[] }

const sizeAt = (depth: number): CanvasSize => (depth === 0 ? "md" : "sm")

const footOf = (kind: NodeKind): number => (kind === "loop" ? LOOP_FOOT : CONTAINER_PADDING)

const childrenOf = (nodes: readonly ApiNode[], parent: string | null): readonly ApiNode[] =>
  nodes.filter((node) => node.parent === parent)

const rootMembers = (nodes: readonly ApiNode[], order: readonly string[]): readonly ApiNode[] => {
  const roots = childrenOf(nodes, null)
  const byId = new Map(roots.map((node) => [node.node_id, node]))
  const declared = order.flatMap((id) => {
    const node = byId.get(id)
    return node === undefined ? [] : [node]
  })
  const rest = roots.filter((node) => !order.includes(node.node_id))
  return [...declared, ...rest]
}

const liftTo = (byId: ReadonlyMap<string, ApiNode>, id: string, level: string | null): string | null => {
  const node = byId.get(id)
  if (node === undefined) return null
  if (node.parent === level) return id
  if (node.parent === null) return null
  return liftTo(byId, node.parent, level)
}

const levelPairs = (byId: ReadonlyMap<string, ApiNode>, members: readonly ApiNode[], level: string | null): readonly Pair[] => {
  const ids = new Set(members.map((node) => node.node_id))
  const seen = new Set<string>()
  return members.flatMap((node) =>
    node.downstream.flatMap((target) => {
      const lifted = liftTo(byId, target, level)
      if (lifted === null || lifted === node.node_id || !ids.has(lifted)) return []
      const key = `${node.node_id}→${lifted}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{ source: node.node_id, target: lifted }]
    }),
  )
}

const successors = (pairs: readonly Pair[]): ReadonlyMap<string, readonly string[]> => {
  const map = new Map<string, string[]>()
  pairs.forEach((pair) => {
    map.set(pair.source, [...(map.get(pair.source) ?? []), pair.target])
  })
  return map
}

const reachableBeyond = (adjacency: ReadonlyMap<string, readonly string[]>, from: string, skip: string): ReadonlySet<string> => {
  const seen = new Set<string>()
  const stack = [...(adjacency.get(from) ?? [])].filter((next) => next !== skip)
  while (stack.length > 0) {
    const next = stack.pop()
    if (next === undefined || seen.has(next)) continue
    seen.add(next)
    stack.push(...(adjacency.get(next) ?? []))
  }
  return seen
}

const reducePairs = (pairs: readonly Pair[]): readonly Pair[] => {
  const adjacency = successors(pairs)
  return pairs.filter((pair) => !reachableBeyond(adjacency, pair.source, pair.target).has(pair.target))
}

const ranksOf = (ids: readonly string[], pairs: readonly Pair[]): ReadonlyMap<string, number> => {
  const incoming = new Map<string, string[]>()
  pairs.forEach((pair) => {
    incoming.set(pair.target, [...(incoming.get(pair.target) ?? []), pair.source])
  })
  const ranks = new Map<string, number>()
  const rankOf = (id: string, visiting: ReadonlySet<string>): number => {
    const cached = ranks.get(id)
    if (cached !== undefined) return cached
    if (visiting.has(id)) return 0
    const next = new Set(visiting).add(id)
    const rank = (incoming.get(id) ?? []).reduce((deepest, from) => Math.max(deepest, rankOf(from, next) + 1), 0)
    ranks.set(id, rank)
    return rank
  }
  ids.forEach((id) => rankOf(id, new Set()))
  return ranks
}

const collectLevelPairs = (
  nodes: readonly ApiNode[],
  byId: ReadonlyMap<string, ApiNode>,
  members: readonly ApiNode[],
  level: string | null,
  acc: Map<string | null, readonly Pair[]>,
): void => {
  acc.set(level, reducePairs(levelPairs(byId, members, level)))
  members.forEach((member) => {
    collectLevelPairs(nodes, byId, childrenOf(nodes, member.node_id), member.node_id, acc)
  })
}

const loopBackEdges = (nodes: readonly ApiNode[], pairsByLevel: ReadonlyMap<string | null, readonly Pair[]>): readonly RoutedEdge[] =>
  nodes.flatMap((node) => {
    if (node.kind !== "loop") return []
    const kids = childrenOf(nodes, node.node_id)
    if (kids.length < 2) return []
    const pairs = pairsByLevel.get(node.node_id) ?? []
    const ranks = ranksOf(
      kids.map((kid) => kid.node_id),
      pairs,
    )
    const ordered = [...kids].sort((left, right) => (ranks.get(left.node_id) ?? 0) - (ranks.get(right.node_id) ?? 0))
    const first = ordered.at(0)
    const last = ordered.at(-1)
    if (first === undefined || last === undefined || (ranks.get(last.node_id) ?? 0) === 0) return []
    return [{ id: `${last.node_id}⟲${first.node_id}`, source: last.node_id, target: first.node_id, variant: "back" as const, level: node.node_id }]
  })

const portsOfNode = (id: string, edges: readonly RoutedEdge[]): readonly ElkPort[] =>
  edges.flatMap((edge): readonly ElkPort[] => {
    if (edge.source === id && edge.variant === "back") {
      return [{ id: BOTTOM_PORT, layoutOptions: { "elk.port.side": "SOUTH" } }]
    }
    if (edge.source === id) return [{ id: `${OUT_PREFIX}${edge.id}`, layoutOptions: { "elk.port.side": "EAST" } }]
    if (edge.target === id) return [{ id: `${IN_PREFIX}${edge.id}`, layoutOptions: { "elk.port.side": "WEST" } }]
    return []
  })

const leftPaddingOf = (kind: NodeKind): number => (kind === "loop" ? LOOP_SIDE : CONTAINER_PADDING)

const containerPadding = (kind: NodeKind): string =>
  `[top=${String(CONTAINER_HEADER)},left=${String(leftPaddingOf(kind))},bottom=${String(footOf(kind))},right=${String(CONTAINER_PADDING)}]`

const elkChild = (nodes: readonly ApiNode[], member: ApiNode, edges: readonly RoutedEdge[], depth: number): ElkNode => {
  const children = childrenOf(nodes, member.node_id)
  const ports = portsOfNode(member.node_id, edges)
  const own = edges.filter((edge) => edge.variant === "flow" && edge.level === member.node_id)
  const base: ElkNode =
    children.length === 0
      ? { id: member.node_id, ...STEP_SIZE[sizeAt(depth)] }
      : {
          id: member.node_id,
          layoutOptions: { "elk.padding": containerPadding(member.kind) },
          children: children.map((child) => elkChild(nodes, child, edges, depth + 1)),
          ...(own.length === 0 ? {} : { edges: own.map(elkEdge) }),
        }
  if (ports.length === 0) return base
  return { ...base, layoutOptions: { ...base.layoutOptions, ...FIXED_SIDE_PORTS }, ports: [...ports] }
}

const elkEdge = (edge: RoutedEdge): ElkExtendedEdge => {
  const sourcePort = edge.variant === "back" ? BOTTOM_PORT : `${OUT_PREFIX}${edge.id}`
  return { id: edge.id, sources: [sourcePort], targets: [`${IN_PREFIX}${edge.id}`] }
}

const flatten = (
  nodes: readonly ApiNode[],
  member: ApiNode,
  laid: ElkNode,
  parent: string | null,
  depth: number,
  absoluteX: number,
  absoluteY: number,
  ports: Map<string, NodePorts>,
  portEdges: ReadonlyMap<string, { readonly edgeId: string; readonly side: "in" | "out" | "bottom" }>,
  points: Map<string, readonly Point[]>,
): readonly CanvasNode[] => {
  const box: Box = { x: laid.x ?? 0, y: laid.y ?? 0, width: laid.width ?? 0, height: laid.height ?? 0 }
  const frameX = absoluteX + box.x
  const frameY = absoluteY + box.y
  ;(laid.edges ?? []).forEach((edge) => {
    points.set(
      edge.id,
      pointsOf(edge).map((point) => ({ x: point.x + frameX, y: point.y + frameY })),
    )
  })
  const own: { in: Port[]; out: Port[]; bottom: Port[] } = { in: [], out: [], bottom: [] }
  ;(laid.ports ?? []).forEach((port) => {
    const meta = portEdges.get(`${member.node_id}/${port.id}`)
    if (meta === undefined) return
    const offset = meta.side === "bottom" ? (port.x ?? 0) / Math.max(box.width, 1) : (port.y ?? 0) / Math.max(box.height, 1)
    own[meta.side].push({ id: port.id, offset, edgeId: meta.edgeId })
  })
  if (own.in.length + own.out.length + own.bottom.length > 0) ports.set(member.node_id, own)
  const children = childrenOf(nodes, member.node_id)
  const common = {
    id: member.node_id,
    parent,
    box,
    size: sizeAt(depth),
    kind: member.kind,
    name: member.local_id,
    problems: member.problems_count,
  }
  if (children.length === 0) {
    return [{ ...common, role: "step", meta: nodeSubtitle(member) ?? "", inputs: member.upstream.length, outputs: member.downstream.length }]
  }
  const byChild = new Map((laid.children ?? []).map((child) => [child.id, child]))
  return [
    { ...common, role: "container", members: children.length },
    ...children.flatMap((child) => {
      const laidChild = byChild.get(child.node_id)
      return laidChild === undefined ? [] : flatten(nodes, child, laidChild, member.node_id, depth + 1, frameX, frameY, ports, portEdges, points)
    }),
  ]
}

const pointsOf = (edge: ElkExtendedEdge): readonly Point[] => {
  const section = edge.sections?.at(0)
  if (section === undefined) return []
  return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
}

export const buildGraph = async (nodes: readonly ApiNode[], order: readonly string[]): Promise<CanvasGraph> => {
  const roots = rootMembers(nodes, order)
  const empty: CanvasGraph = { nodes: [], edges: [], ports: new Map(), extent: { x: 0, y: 0, width: 0, height: 0 } }
  if (roots.length === 0) return empty
  const byId = new Map(nodes.map((node) => [node.node_id, node]))
  const pairsByLevel = new Map<string | null, readonly Pair[]>()
  collectLevelPairs(nodes, byId, roots, null, pairsByLevel)
  const flow: readonly RoutedEdge[] = [...pairsByLevel.entries()].flatMap(([level, pairs]) =>
    pairs.map((pair) => ({ ...pair, id: `${pair.source}→${pair.target}`, variant: "flow" as const, level })),
  )
  const routed = [...flow, ...loopBackEdges(nodes, pairsByLevel)]
  const backs = routed.filter((edge) => edge.variant === "back")
  const portEdges = new Map<string, { readonly edgeId: string; readonly side: "in" | "out" | "bottom" }>()
  routed.forEach((edge) => {
    if (edge.variant === "back") portEdges.set(`${edge.source}/${BOTTOM_PORT}`, { edgeId: edge.id, side: "bottom" })
    else portEdges.set(`${edge.source}/${OUT_PREFIX}${edge.id}`, { edgeId: edge.id, side: "out" })
    portEdges.set(`${edge.target}/${IN_PREFIX}${edge.id}`, { edgeId: edge.id, side: "in" })
  })
  const rootEdges = flow.filter((edge) => edge.level === null)
  const input: ElkInput = {
    id: "root",
    layoutOptions: { ...ROOT_OPTIONS },
    children: roots.map((member) => elkChild(nodes, member, routed, 0)),
    edges: rootEdges.map(elkEdge),
  }
  const laid = await elk.layout(input)
  const ports = new Map<string, NodePorts>()
  const points = new Map<string, readonly Point[]>()
  rootEdges.forEach((edge) => {
    const laidEdge = (laid.edges ?? []).find((candidate) => candidate.id === edge.id)
    if (laidEdge !== undefined) points.set(edge.id, pointsOf(laidEdge))
  })
  const byRoot = new Map((laid.children ?? []).map((child) => [child.id, child]))
  const canvasNodes = roots.flatMap((member) => {
    const laidRoot = byRoot.get(member.node_id)
    return laidRoot === undefined ? [] : flatten(nodes, member, laidRoot, null, 0, 0, 0, ports, portEdges, points)
  })
  const abs = (id: string): Box => absoluteBox(canvasNodes, id) ?? { x: 0, y: 0, width: 0, height: 0 }
  backs.forEach((edge) => {
    if (edge.level === null) return
    const source = abs(edge.source)
    const target = abs(edge.target)
    const container = abs(edge.level)
    const sourcePorts = ports.get(edge.source)
    const targetPorts = ports.get(edge.target)
    const bottom = sourcePorts?.bottom.at(0)
    const entry = targetPorts?.in.find((port) => port.edgeId === edge.id)
    const start = { x: source.x + (bottom?.offset ?? 0.5) * source.width, y: source.y + source.height }
    const end = { x: target.x, y: target.y + (entry?.offset ?? 0.5) * target.height }
    const channelY = container.y + container.height - LOOP_FOOT / 2
    const channelX = container.x + leftPaddingOf(byId.get(edge.level)?.kind ?? "loop") / 2
    points.set(edge.id, [start, { x: start.x, y: channelY }, { x: channelX, y: channelY }, { x: channelX, y: end.y }, end])
  })
  return {
    nodes: canvasNodes,
    edges: routed.map((edge) => ({ ...edge, points: points.get(edge.id) ?? [] })),
    ports,
    extent: { x: 0, y: 0, width: laid.width ?? 0, height: laid.height ?? 0 },
  }
}

export const absoluteBox = (nodes: readonly CanvasNode[], id: string): Box | null => {
  const node = nodes.find((candidate) => candidate.id === id)
  if (node === undefined) return null
  if (node.parent === null) return node.box
  const parent = absoluteBox(nodes, node.parent)
  if (parent === null) return node.box
  return { ...node.box, x: parent.x + node.box.x, y: parent.y + node.box.y }
}
