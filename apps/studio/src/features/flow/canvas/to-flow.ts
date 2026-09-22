import { MarkerType, type Edge, type FitViewOptions, type Node } from "@xyflow/react"
import type { NodeKind } from "@/domain"
import type { CanvasContainer, CanvasEdge, CanvasNode, CanvasSize, CanvasStep, EdgeVariant } from "../layout"
import { EDGE_COLOR, type FlowEdgeData } from "./edge-style"
import type { NodeHandle } from "./handles"

export type StepData = {
  readonly kind: NodeKind
  readonly name: string
  readonly meta: string
  readonly inputs: number
  readonly outputs: number
  readonly problems: number
  readonly size: CanvasSize
  readonly reversed: boolean
}

export type ContainerData = {
  readonly kind: NodeKind
  readonly name: string
  readonly members: number
  readonly problems: number
  readonly size: CanvasSize
  readonly reversed: boolean
}

export type StepFlowNode = Node<StepData, "step">
export type ContainerFlowNode = Node<ContainerData, "container">
export type CanvasFlowNode = StepFlowNode | ContainerFlowNode
export type CanvasFlowEdge = Edge<FlowEdgeData, "flow">

type EdgeEnds = { readonly source: NodeHandle; readonly target: NodeHandle }

const MARKER_SIZE = 14
const FIT_PADDING = "32px"
const FIT_MAX_ZOOM = 1

const EDGE_ENDS: Readonly<Record<EdgeVariant, EdgeEnds>> = {
  flow: { source: "out", target: "in" },
  back: { source: "bottom", target: "in" },
}

const edgeData = (variant: EdgeVariant): FlowEdgeData =>
  variant === "back" ? { variant: "back", label: null, detourY: null } : { variant: "flow", label: null }

const placement = (node: CanvasNode): Pick<Node, "id" | "position" | "draggable" | "parentId"> => ({
  id: node.id,
  position: { x: node.box.x, y: node.box.y },
  draggable: false,
  ...(node.parent === null ? {} : { parentId: node.parent }),
})

const stepNode = (node: CanvasStep): StepFlowNode => ({
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
  },
})

const containerNode = (node: CanvasContainer): ContainerFlowNode => ({
  ...placement(node),
  width: node.box.width,
  height: node.box.height,
  type: "container",
  selectable: true,
  data: { kind: node.kind, name: node.name, members: node.members, problems: node.problems, size: node.size, reversed: node.reversed },
})

export const toFlowNodes = (nodes: readonly CanvasNode[]): CanvasFlowNode[] =>
  nodes.map((node) => (node.role === "step" ? stepNode(node) : containerNode(node)))

export const toFlowEdges = (edges: readonly CanvasEdge[]): CanvasFlowEdge[] =>
  edges.map((edge) => ({
    id: edge.id,
    type: "flow",
    source: edge.source,
    target: edge.target,
    sourceHandle: EDGE_ENDS[edge.variant].source,
    targetHandle: EDGE_ENDS[edge.variant].target,
    selectable: false,
    focusable: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR[edge.variant], width: MARKER_SIZE, height: MARKER_SIZE },
    data: edgeData(edge.variant),
  }))

export const fitViewOptions = (nodes: readonly CanvasNode[]): FitViewOptions<CanvasFlowNode> => ({
  nodes: nodes.filter((node) => node.parent === null).map((node) => ({ id: node.id })),
  padding: FIT_PADDING,
  maxZoom: FIT_MAX_ZOOM,
})
