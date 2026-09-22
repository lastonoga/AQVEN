import type { Box, CanvasEdge, CanvasGraph } from "../layout"

export type Port = { readonly id: string; readonly offset: number }
export type NodePorts = { readonly in: readonly Port[]; readonly out: readonly Port[] }

export const OUT_PREFIX = "out-"
export const IN_PREFIX = "in-"

const ZERO_BOX: Box = { x: 0, y: 0, width: 0, height: 0 }
const EMPTY_PORTS: NodePorts = { in: [], out: [] }
const SPREAD = 0.6

const centerOf = (box: Box): number => box.y + box.height / 2

const offsetOf = (index: number, count: number): number =>
  count <= 1 ? 0.5 : 0.5 - SPREAD / 2 + (SPREAD * index) / (count - 1)

const groupedBy = (edges: readonly CanvasEdge[], keyOf: (edge: CanvasEdge) => string): ReadonlyMap<string, readonly CanvasEdge[]> => {
  const map = new Map<string, readonly CanvasEdge[]>()
  edges.forEach((edge) => {
    const key = keyOf(edge)
    map.set(key, [...(map.get(key) ?? []), edge])
  })
  return map
}

const spreadPorts = (
  edges: readonly CanvasEdge[],
  otherOf: (edge: CanvasEdge) => string,
  boxOf: ReadonlyMap<string, Box>,
  prefix: string,
): readonly Port[] => {
  const ordered = [...edges].sort((left, right) => centerOf(boxOf.get(otherOf(left)) ?? ZERO_BOX) - centerOf(boxOf.get(otherOf(right)) ?? ZERO_BOX))
  return ordered.map((edge, index) => ({ id: prefix + edge.id, offset: offsetOf(index, ordered.length) }))
}

export const sourceHandleOf = (edge: CanvasEdge): string => (edge.variant === "back" ? "bottom" : OUT_PREFIX + edge.id)
export const targetHandleOf = (edge: CanvasEdge): string => IN_PREFIX + edge.id

export const nodePorts = (graph: CanvasGraph): ReadonlyMap<string, NodePorts> => {
  const boxOf = new Map(graph.nodes.map((node) => [node.id, node.box]))
  const outByNode = groupedBy(
    graph.edges.filter((edge) => edge.variant === "flow"),
    (edge) => edge.source,
  )
  const inByNode = groupedBy(graph.edges, (edge) => edge.target)
  const nodeIds = new Set([...outByNode.keys(), ...inByNode.keys()])
  const result = new Map<string, NodePorts>()
  nodeIds.forEach((id) => {
    result.set(id, {
      out: spreadPorts(outByNode.get(id) ?? [], (edge) => edge.target, boxOf, OUT_PREFIX),
      in: spreadPorts(inByNode.get(id) ?? [], (edge) => edge.source, boxOf, IN_PREFIX),
    })
  })
  return result
}

export const portsOf = (ports: ReadonlyMap<string, NodePorts>, id: string): NodePorts => ports.get(id) ?? EMPTY_PORTS
