import type { CanvasEdge, NodePorts } from "../layout"

export type { NodePorts, Port } from "../layout"

export const OUT_PREFIX = "out-"
export const IN_PREFIX = "in-"
export const BOTTOM_HANDLE = "bottom"

const EMPTY_PORTS: NodePorts = { in: [], out: [], bottom: [] }

export const sourceHandleOf = (edge: CanvasEdge): string => (edge.variant === "back" ? BOTTOM_HANDLE : OUT_PREFIX + edge.id)
export const targetHandleOf = (edge: CanvasEdge): string => IN_PREFIX + edge.id

export const portsOf = (ports: ReadonlyMap<string, NodePorts>, id: string): NodePorts => ports.get(id) ?? EMPTY_PORTS
