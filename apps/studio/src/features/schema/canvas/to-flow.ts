import { MarkerType, type Edge, type FitViewOptions, type Node } from "@xyflow/react"
import type {
  AnchorNode,
  CanvasStage,
  GatewayMode,
  GatewayNode,
  GroupKind,
  GroupNode,
  SchemaEdge,
  SchemaNode,
  StepNode,
} from "@/domain"
import { STAGE_KIND, type KindSpec, type Tone } from "@/components/studio"
import { EDGE_COLOR, type EdgeVariant, type FlowEdgeData } from "./edge-style"

export type CanvasSize = "md" | "sm"
export type GroupFrame = "tinted" | "outlined" | "dashed" | "none"

export type StepData = StepNode["data"] & { readonly size: CanvasSize }
export type ContainerData = {
  readonly tag: string
  readonly tone: Tone
  readonly frame: GroupFrame
  readonly size: CanvasSize
  readonly title: string | null
  readonly caption: string | null
  readonly flowY: number | null
}
export type GatewayData = { readonly mode: GatewayMode }
export type AnchorData = Record<string, never>

export type StepFlowNode = Node<StepData, "step">
export type ContainerFlowNode = Node<ContainerData, "container">
export type GatewayFlowNode = Node<GatewayData, "gateway">
export type AnchorFlowNode = Node<AnchorData, "anchor">
export type SchemaFlowNode = StepFlowNode | ContainerFlowNode | GatewayFlowNode | AnchorFlowNode
export type SchemaFlowEdge = Edge<FlowEdgeData, "flow">

type Dimensions = { readonly width: number; readonly height: number }
type SchemaNodeFields = { readonly step: StepNode; readonly group: GroupNode; readonly gateway: GatewayNode; readonly anchor: AnchorNode }
type SchemaNodeType = keyof SchemaNodeFields
type NodeMappers = { readonly [K in SchemaNodeType]: (node: SchemaNodeFields[K], sizeOf: (node: SchemaNode) => CanvasSize) => SchemaFlowNode }
type EdgeDataMappers = { readonly [K in EdgeVariant]: (edge: SchemaEdge) => FlowEdgeData<K> }

export const STEP_DIMENSIONS: Readonly<Record<CanvasSize, Dimensions>> = {
  md: { width: 240, height: 92 },
  sm: { width: 220, height: 84 },
}

const GATEWAY_DIMENSIONS: Dimensions = { width: 44, height: 44 }
const ANCHOR_DIMENSIONS: Dimensions = { width: 1, height: 1 }
const MARKER_SIZE = 14
const FIT_PADDING = "28px"
const FIT_MAX_ZOOM = 1.2

const SECTION_KIND: KindSpec = { code: "STAGE", tone: "neutral" }

export const GROUP_KIND: Readonly<Record<GroupKind, KindSpec>> = { ...STAGE_KIND, section: SECTION_KIND }

export const GROUP_FRAME: Readonly<Record<GroupKind, Exclude<GroupFrame, "dashed">>> = {
  seq: "tinted",
  map: "tinted",
  diverge: "tinted",
  loop: "tinted",
  switch: "tinted",
  parallel: "outlined",
  section: "none",
}

export const groupTag = (data: GroupNode["data"]): string => {
  const { code } = GROUP_KIND[data.kind]
  if (data.kind === "section") return [code, data.stage].filter((part) => part !== undefined).join(" ")
  if (data.fanOut === undefined) return code
  return `${code} ×${String(data.fanOut)}`
}

export const groupFrame = (data: GroupNode["data"]): GroupFrame => (data.dashed === true ? "dashed" : GROUP_FRAME[data.kind])

const placement = (node: SchemaNode): Pick<Node, "id" | "position" | "parentId" | "draggable"> => ({
  id: node.id,
  position: node.position,
  draggable: false,
  ...(node.parentId === undefined ? {} : { parentId: node.parentId }),
})

const NODE_MAPPER: NodeMappers = {
  step: (node, sizeOf) => {
    const size = sizeOf(node)
    return {
      ...placement(node),
      ...STEP_DIMENSIONS[size],
      type: "step",
      selectable: node.data.inspectable,
      data: { ...node.data, size },
    }
  },
  group: (node, sizeOf) => ({
    ...placement(node),
    width: node.width,
    height: node.height,
    type: "container",
    selectable: false,
    focusable: false,
    data: {
      tag: groupTag(node.data),
      tone: GROUP_KIND[node.data.kind].tone,
      frame: groupFrame(node.data),
      size: sizeOf(node),
      title: node.data.title ?? null,
      caption: node.data.caption ?? null,
      flowY: node.data.flowY ?? null,
    },
  }),
  gateway: (node) => ({
    ...placement(node),
    ...GATEWAY_DIMENSIONS,
    type: "gateway",
    selectable: false,
    focusable: false,
    data: { mode: node.data.mode },
  }),
  anchor: (node) => ({
    ...placement(node),
    ...ANCHOR_DIMENSIONS,
    type: "anchor",
    selectable: false,
    focusable: false,
    data: {},
  }),
}

const mapNode = <K extends SchemaNodeType>(node: SchemaNodeFields[K] & { readonly type: K }, sizeOf: (node: SchemaNode) => CanvasSize): SchemaFlowNode => {
  const map: (node: SchemaNodeFields[K], sizeOf: (node: SchemaNode) => CanvasSize) => SchemaFlowNode = NODE_MAPPER[node.type]
  return map(node, sizeOf)
}

const sectionSizer = (nodes: readonly SchemaNode[]): ((node: SchemaNode) => CanvasSize) => {
  const parents = new Map(nodes.map((node) => [node.id, node.parentId] as const))
  const sections = new Set(nodes.filter((node) => node.type === "group" && node.data.kind === "section").map((node) => node.id))
  const insideSection = (parentId: string | undefined): boolean => {
    if (parentId === undefined) return false
    if (sections.has(parentId)) return true
    return insideSection(parents.get(parentId))
  }
  return (node) => (insideSection(node.parentId) ? "sm" : "md")
}

export const toFlowNodes = (nodes: readonly SchemaNode[]): SchemaFlowNode[] => {
  const sizeOf = sectionSizer(nodes)
  return nodes.map((node) => mapNode(node, sizeOf))
}

const labelOf = (edge: SchemaEdge): string | null => edge.label ?? null

const EDGE_DATA: EdgeDataMappers = {
  flow: (edge) => ({ variant: "flow", label: labelOf(edge) }),
  back: (edge) => ({ variant: "back", label: labelOf(edge), detourY: edge.detourY ?? null }),
}

export const toFlowEdges = (edges: readonly SchemaEdge[]): SchemaFlowEdge[] =>
  edges.map((edge) => ({
    id: edge.id,
    type: "flow",
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
    selectable: false,
    focusable: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR[edge.variant], width: MARKER_SIZE, height: MARKER_SIZE },
    data: EDGE_DATA[edge.variant](edge),
  }))

const fitsView = (node: SchemaNode): boolean => node.parentId === undefined && (node.type !== "group" || node.data.fit)

export const fitViewOptions = (nodes: readonly SchemaNode[]): FitViewOptions<SchemaFlowNode> => ({
  nodes: nodes.filter(fitsView).map((node) => ({ id: node.id })),
  padding: FIT_PADDING,
  maxZoom: FIT_MAX_ZOOM,
})

export const findStage = (stages: readonly CanvasStage[], stage: number | null): CanvasStage | null =>
  stages.find((candidate) => candidate.number === stage) ?? null
