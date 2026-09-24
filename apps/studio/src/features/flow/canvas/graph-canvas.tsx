import { useState } from "react"
import {
  Background,
  BackgroundVariant,
  Panel,
  ReactFlow,
  type EdgeTypes,
  type NodeMouseHandler,
  type NodeTypes,
  type ProOptions,
} from "@xyflow/react"
import { useTranslations } from "use-intl"
import { absoluteBox, type CanvasGraph } from "../layout"
import { ContainerNode } from "./container-node"
import { edgeColors } from "./edge-colors"
import { FlowEdge } from "./flow-edge"
import { Legend } from "./legend"
import { nodePorts } from "./ports"
import { HoveredNodeContext, SelectedNodeContext } from "./selection"
import { StepNode } from "./step-node"
import { fitViewOptions, toFlowEdges, toFlowNodes, type CanvasFlowNode, type FitSpace } from "./to-flow"
import { useNodeFocus } from "./use-node-focus"
import { MAX_ZOOM, MIN_ZOOM } from "./viewport"
import { ZoomControl } from "./zoom-control"

export type GraphCanvasProps = {
  readonly graph: CanvasGraph
  readonly selected: string | null
  readonly legend: boolean
  readonly onSelect: (node: string) => void
  readonly onToggleLegend: () => void
  readonly dimmed?: ReadonlySet<string>
  readonly pageScroll?: boolean
  readonly focusInset?: number
  readonly fitSpace?: FitSpace
}

const NODE_TYPES = { step: StepNode, container: ContainerNode } satisfies NodeTypes
const EDGE_TYPES = { flow: FlowEdge } satisfies EdgeTypes
const PRO_OPTIONS: ProOptions = { hideAttribution: true }
const DOT_GAP = 24
const DIMMED_CLASS = "opacity-35"
const NONE_DIMMED: ReadonlySet<string> = new Set()

const dimNodes = (nodes: CanvasFlowNode[], dimmed: ReadonlySet<string>): CanvasFlowNode[] =>
  nodes.map((node) => (dimmed.has(node.id) ? { ...node, className: DIMMED_CLASS } : node))

type FocusedNodeProps = { readonly graph: CanvasGraph; readonly selected: string | null; readonly inset: number }

function FocusedNode({ graph, selected, inset }: FocusedNodeProps) {
  useNodeFocus(selected === null ? null : absoluteBox(graph.nodes, selected), inset)
  return null
}

export function GraphCanvas({ graph, selected, legend, onSelect, onToggleLegend, dimmed = NONE_DIMMED, pageScroll = false, focusInset = 0, fitSpace = "roomy" }: GraphCanvasProps) {
  const t = useTranslations("flow.canvas")
  const [hovered, setHovered] = useState<string | null>(null)
  const fitOptions = fitViewOptions(graph.nodes, fitSpace)
  const colors = edgeColors(graph.edges)
  const selectNode: NodeMouseHandler<CanvasFlowNode> = (_event, node) => {
    onSelect(node.id)
  }
  const enterNode: NodeMouseHandler<CanvasFlowNode> = (_event, node) => {
    setHovered(node.id)
  }
  const leaveNode = (): void => {
    setHovered(null)
  }
  return (
    <SelectedNodeContext value={selected}>
      <HoveredNodeContext value={hovered}>
        <ReactFlow
          aria-label={t("aria")}
          nodes={dimNodes(toFlowNodes(graph.nodes, nodePorts(graph), colors), dimmed)}
          edges={toFlowEdges(graph.edges, colors)}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          elevateNodesOnSelect={false}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          fitView
          fitViewOptions={fitOptions}
          zoomOnDoubleClick={false}
          zoomOnScroll={!pageScroll}
          preventScrolling={!pageScroll}
          proOptions={PRO_OPTIONS}
          onNodeClick={selectNode}
          onNodeMouseEnter={enterNode}
          onNodeMouseLeave={leaveNode}
        >
          <Background variant={BackgroundVariant.Dots} gap={DOT_GAP} size={1} color="var(--border)" bgColor="var(--background-subtle)" />
          <FocusedNode graph={graph} selected={selected} inset={focusInset} />
          <Panel position="top-right" className="m-3.5">
            <Legend open={legend} onToggle={onToggleLegend} />
          </Panel>
          <Panel position="bottom-left" className="m-3">
            <ZoomControl fitOptions={fitOptions} />
          </Panel>
        </ReactFlow>
      </HoveredNodeContext>
    </SelectedNodeContext>
  )
}
