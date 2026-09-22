import type { ApiNode, NodeKind } from "@/domain"
import { nodeSubtitle } from "./node-facts"

export type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
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
  readonly reversed: boolean
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
}

export type CanvasGraph = {
  readonly nodes: readonly CanvasNode[]
  readonly edges: readonly CanvasEdge[]
  readonly extent: Box
}

type Size = { readonly width: number; readonly height: number }
type Sized = Size & { readonly id: string }
type Pair = { readonly source: string; readonly target: string }
type Column = { readonly members: readonly Sized[] } & Size
type Level = { readonly nodes: readonly CanvasNode[]; readonly edges: readonly CanvasEdge[] } & Size

const STEP_SIZE: Readonly<Record<CanvasSize, Size>> = {
  md: { width: 240, height: 92 },
  sm: { width: 220, height: 84 },
}

const CONTAINER_HEADER = 36

const CONTAINER_PADDING = 14
const LOOP_FOOT = 34
const RANK_GAP = 64
const STACK_GAP = 16
const ROW_GAP = 96
const MAX_ROW_WIDTH = 1520

const sizeAt = (depth: number): CanvasSize => (depth === 0 ? "md" : "sm")

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
  const stack = [...(adjacency.get(from) ?? []).filter((next) => next !== skip)]
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

const predecessorsOf = (pairs: readonly Pair[]): ReadonlyMap<string, readonly string[]> => {
  const map = new Map<string, string[]>()
  pairs.forEach((pair) => {
    map.set(pair.target, [...(map.get(pair.target) ?? []), pair.source])
  })
  return map
}

const barycenterOf = (id: string, predecessors: ReadonlyMap<string, readonly string[]>, position: ReadonlyMap<string, number>): number | null => {
  const known = (predecessors.get(id) ?? []).flatMap((parent) => {
    const at = position.get(parent)
    return at === undefined ? [] : [at]
  })
  return known.length === 0 ? null : known.reduce((total, at) => total + at, 0) / known.length
}

const orderedByBarycenter = (ranked: readonly (readonly Sized[])[], pairs: readonly Pair[]): readonly (readonly Sized[])[] => {
  const predecessors = predecessorsOf(pairs)
  const position = new Map<string, number>()
  return ranked.map((members) => {
    const ordered = members
      .map((member, index) => ({ member, index }))
      .sort((left, right) => {
        const leftKey = barycenterOf(left.member.id, predecessors, position) ?? left.index
        const rightKey = barycenterOf(right.member.id, predecessors, position) ?? right.index
        return leftKey - rightKey || left.index - right.index
      })
      .map(({ member }) => member)
    ordered.forEach((member, index) => position.set(member.id, index))
    return ordered
  })
}

const columnsOf = (sized: readonly Sized[], pairs: readonly Pair[]): readonly Column[] => {
  const ranks = ranksOf(
    sized.map((node) => node.id),
    pairs,
  )
  const byRank = new Map<number, Sized[]>()
  sized.forEach((node) => {
    const rank = ranks.get(node.id) ?? 0
    byRank.set(rank, [...(byRank.get(rank) ?? []), node])
  })
  const ascending = [...byRank.keys()].sort((left, right) => left - right).map((rank) => byRank.get(rank) ?? [])
  return orderedByBarycenter(ascending, pairs).map((members) => ({
    members,
    width: members.reduce((widest, node) => Math.max(widest, node.width), 0),
    height: members.reduce((total, node) => total + node.height, 0) + STACK_GAP * (members.length - 1),
  }))
}

const wrapRows = (columns: readonly Column[]): readonly (readonly Column[])[] =>
  columns.reduce<(readonly Column[])[]>((rows, column) => {
    const current = rows.at(-1)
    if (current === undefined) return [[column]]
    const used = current.reduce((total, member) => total + member.width + RANK_GAP, 0)
    if (used + column.width > MAX_ROW_WIDTH) return [...rows, [column]]
    return [...rows.slice(0, -1), [...current, column]]
  }, [])

const rowWidth = (row: readonly Column[]): number =>
  row.reduce((total, column) => total + column.width, 0) + RANK_GAP * Math.max(row.length - 1, 0)

const placeColumns = (
  sized: readonly Sized[],
  pairs: readonly Pair[],
): { readonly boxes: ReadonlyMap<string, Box>; readonly reversed: ReadonlySet<string> } & Size => {
  const rows = wrapRows(columnsOf(sized, pairs))
  const canvasWidth = rows.reduce((widest, row) => Math.max(widest, rowWidth(row)), 0)
  const boxes = new Map<string, Box>()
  const reversed = new Set<string>()
  let top = 0
  rows.forEach((row, rowIndex) => {
    const rowHeight = row.reduce((tallest, column) => Math.max(tallest, column.height), 0)
    const flip = rowIndex % 2 === 1
    let left = 0
    row.forEach((column) => {
      const columnLeft = flip ? canvasWidth - left - column.width : left
      let memberTop = top + (rowHeight - column.height) / 2
      column.members.forEach((member) => {
        boxes.set(member.id, { x: columnLeft + (column.width - member.width) / 2, y: memberTop, width: member.width, height: member.height })
        if (flip) reversed.add(member.id)
        memberTop += member.height + STACK_GAP
      })
      left += column.width + RANK_GAP
    })
    top += rowHeight + ROW_GAP
  })
  return { boxes, reversed, width: canvasWidth, height: Math.max(top - ROW_GAP, 0) }
}

const backEdges = (kind: NodeKind | null, sized: readonly Sized[], pairs: readonly Pair[]): readonly CanvasEdge[] => {
  if (kind !== "loop" || sized.length < 2) return []
  const ranks = ranksOf(
    sized.map((node) => node.id),
    pairs,
  )
  const ordered = [...sized].sort((left, right) => (ranks.get(left.id) ?? 0) - (ranks.get(right.id) ?? 0))
  const first = ordered.at(0)
  const last = ordered.at(-1)
  if (first === undefined || last === undefined || (ranks.get(last.id) ?? 0) === 0) return []
  return [{ id: `${last.id}⟲${first.id}`, source: last.id, target: first.id, variant: "back" }]
}

const shift = (nodes: readonly CanvasNode[], parent: string, dx: number, dy: number): readonly CanvasNode[] =>
  nodes.map((node) => (node.parent === parent ? { ...node, box: { ...node.box, x: node.box.x + dx, y: node.box.y + dy } } : node))

const footOf = (kind: NodeKind): number => (kind === "loop" ? LOOP_FOOT : CONTAINER_PADDING)

const buildLevel = (
  nodes: readonly ApiNode[],
  byId: ReadonlyMap<string, ApiNode>,
  members: readonly ApiNode[],
  level: string | null,
  levelKind: NodeKind | null,
  depth: number,
): Level => {
  const inner = members.map((member) => ({
    member,
    level: buildLevel(nodes, byId, childrenOf(nodes, member.node_id), member.node_id, member.kind, depth + 1),
  }))
  const sized: readonly Sized[] = inner.map(({ member, level: child }) =>
    child.nodes.length === 0
      ? { id: member.node_id, ...STEP_SIZE[sizeAt(depth)] }
      : {
          id: member.node_id,
          width: child.width + CONTAINER_PADDING * 2,
          height: child.height + CONTAINER_HEADER + footOf(member.kind),
        },
  )
  const pairs = reducePairs(levelPairs(byId, members, level))
  const placed = placeColumns(sized, pairs)
  const own = inner.flatMap(({ member, level: child }): readonly CanvasNode[] => {
    const box = placed.boxes.get(member.node_id) ?? { x: 0, y: 0, width: 0, height: 0 }
    const common = {
      id: member.node_id,
      parent: level,
      box,
      size: sizeAt(depth),
      kind: member.kind,
      name: member.local_id,
      problems: member.problems_count,
      reversed: placed.reversed.has(member.node_id),
    }
    if (child.nodes.length === 0) {
      return [{ ...common, role: "step", meta: nodeSubtitle(member) ?? "", inputs: member.upstream.length, outputs: member.downstream.length }]
    }
    return [
      { ...common, role: "container", members: child.nodes.filter((node) => node.parent === member.node_id).length },
      ...shift(child.nodes, member.node_id, CONTAINER_PADDING, CONTAINER_HEADER),
    ]
  })
  const flow = pairs.map((pair) => ({ id: `${pair.source}→${pair.target}`, source: pair.source, target: pair.target, variant: "flow" as const }))
  return {
    nodes: own,
    edges: [...flow, ...backEdges(levelKind, sized, pairs), ...inner.flatMap(({ level: child }) => child.edges)],
    width: placed.width,
    height: placed.height,
  }
}

export const buildGraph = (nodes: readonly ApiNode[], order: readonly string[]): CanvasGraph => {
  const byId = new Map(nodes.map((node) => [node.node_id, node]))
  const level = buildLevel(nodes, byId, rootMembers(nodes, order), null, null, 0)
  return { nodes: level.nodes, edges: level.edges, extent: { x: 0, y: 0, width: level.width, height: level.height } }
}

export const absoluteBox = (nodes: readonly CanvasNode[], id: string): Box | null => {
  const node = nodes.find((candidate) => candidate.id === id)
  if (node === undefined) return null
  if (node.parent === null) return node.box
  const parent = absoluteBox(nodes, node.parent)
  if (parent === null) return node.box
  return { ...node.box, x: parent.x + node.box.x, y: parent.y + node.box.y }
}
