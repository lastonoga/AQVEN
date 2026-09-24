import { MarkerType, type Edge, type FitViewOptions, type Node } from "@xyflow/react"
import type { NodeKind } from "@/domain"
import type { CanvasContainer, CanvasEdge, CanvasNode, CanvasSize, CanvasStep, EdgeVariant } from "../layout"
import { DEFAULT_FLOW_COLOR } from "./edge-colors"
import type { FlowEdgeRenderData } from "./edge-style"
import type { NodeDots } from "./handles"
import { sourceHandleOf, targetHandleOf, type NodePorts, type Port } from "./ports"

export type StepData = {
  readonly kind: NodeKind
  readonly name: string
  readonly meta: string
  readonly inputs: number
  readonly outputs: number
  readonly problems: number
  readonly size: CanvasSize
  readonly reversed: boolean
  readonly ports: NodeDots
}

export type ContainerData = {
  readonly kind: NodeKind
  readonly name: string
  readonly members: number
  readonly problems: number
  readonly size: CanvasSize
  readonly reversed: boolean
  readonly ports: NodeDots
}

export type StepFlowNode = Node<StepData, "step">
export type ContainerFlowNode = Node<ContainerData, "container">
export type CanvasFlowNode = StepFlowNode | ContainerFlowNode
export type CanvasFlowEdge = Edge<FlowEdgeRenderData, "flow">

const MARKER_SIZE = 14
const FIT_PADDING: FitViewOptions["padding"] = { top: "56px", right: "32px", bottom: "64px", left: "32px" }
const FIT_MAX_ZOOM = 1
const EMPTY_PORTS: NodePorts = { in: [], out: [], bottom: [] }

const edgeData = (variant: EdgeVariant, color: string): FlowEdgeRenderData =>
  variant === "back" ? { variant: "back", label: null, detourY: null, color } : { variant: "flow", label: null, color }

const dotsOf = (ports: NodePorts, colors: ReadonlyMap<string, string>): NodeDots => {
  const colored = (side: readonly Port[]) => side.map((port) => ({ id: port.id, offset: port.offset, color: colors.get(port.edgeId) ?? DEFAULT_FLOW_COLOR }))
  return { in: colored(ports.in), out: colored(ports.out), bottom: colored(ports.bottom) }
}

const placement = (node: CanvasNode): Pick<Node, "id" | "position" | "draggable" | "parentId"> => ({
  id: node.id,
  position: { x: node.box.x, y: node.box.y },
  draggable: false,
  ...(node.parent === null ? {} : { parentId: node.parent }),
})

const stepNode = (node: CanvasStep, ports: NodeDots): StepFlowNode => ({
  ...placement(node),
  width: node.box.width,
  height: node.box.height,
  type: "step",
  selectable: true,
  data: {
    kind: node.kind,
    name: node.name,
    meta: node.meta,
    inputs: node.inputs,
    outputs: node.outputs,
    problems: node.problems,
    size: node.size,
    reversed: node.reversed,
    ports,
  },
})

const containerNode = (node: CanvasContainer, ports: NodeDots): ContainerFlowNode => ({
  ...placement(node),
  width: node.box.width,
  height: node.box.height,
  type: "container",
  selectable: true,
  data: {
    kind: node.kind,
    name: node.name,
    members: node.members,
    problems: node.problems,
    size: node.size,
    reversed: node.reversed,
    ports,
  },
})

export const toFlowNodes = (
  nodes: readonly CanvasNode[],
  ports: ReadonlyMap<string, NodePorts>,
  colors: ReadonlyMap<string, string>,
): CanvasFlowNode[] =>
  nodes.map((node) => {
    const dots = dotsOf(ports.get(node.id) ?? EMPTY_PORTS, colors)
    return node.role === "step" ? stepNode(node, dots) : containerNode(node, dots)
  })

export const toFlowEdges = (edges: readonly CanvasEdge[], colors: ReadonlyMap<string, string>): CanvasFlowEdge[] =>
  edges.map((edge) => {
    const color = colors.get(edge.id) ?? DEFAULT_FLOW_COLOR
    return {
      id: edge.id,
      type: "flow",
      source: edge.source,
      target: edge.target,
      sourceHandle: sourceHandleOf(edge),
      targetHandle: targetHandleOf(edge),
      selectable: false,
      focusable: false,
      markerEnd: { type: MarkerType.ArrowClosed, color, width: MARKER_SIZE, height: MARKER_SIZE },
      data: edgeData(edge.variant, color),
    }
  })

export const fitViewOptions = (nodes: readonly CanvasNode[]): FitViewOptions<CanvasFlowNode> => ({
  nodes: nodes.filter((node) => node.parent === null).map((node) => ({ id: node.id })),
  padding: FIT_PADDING,
  maxZoom: FIT_MAX_ZOOM,
})
