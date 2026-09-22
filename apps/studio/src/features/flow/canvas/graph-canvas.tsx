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
import { FlowEdge } from "./flow-edge"
import { Legend } from "./legend"
import { nodePorts } from "./ports"
import { SelectedNodeContext } from "./selection"
import { StepNode } from "./step-node"
import { fitViewOptions, toFlowEdges, toFlowNodes, type CanvasFlowNode } from "./to-flow"
import { useNodeFocus } from "./use-node-focus"
import { MAX_ZOOM, MIN_ZOOM } from "./viewport"
import { ZoomControl } from "./zoom-control"

export type GraphCanvasProps = {
  readonly graph: CanvasGraph
  readonly selected: string | null
  readonly legend: boolean
  readonly onSelect: (node: string) => void
  readonly onToggleLegend: () => void
}

const NODE_TYPES = { step: StepNode, container: ContainerNode } satisfies NodeTypes
const EDGE_TYPES = { flow: FlowEdge } satisfies EdgeTypes
const PRO_OPTIONS: ProOptions = { hideAttribution: true }
const DOT_GAP = 24

function FocusedNode({ graph, selected }: { readonly graph: CanvasGraph; readonly selected: string | null }) {
  useNodeFocus(selected === null ? null : absoluteBox(graph.nodes, selected))
  return null
}

export function GraphCanvas({ graph, selected, legend, onSelect, onToggleLegend }: GraphCanvasProps) {
  const t = useTranslations("flow.canvas")
  const fitOptions = fitViewOptions(graph.nodes)
  const selectNode: NodeMouseHandler<CanvasFlowNode> = (_event, node) => {
    onSelect(node.id)
  }
  return (
    <SelectedNodeContext value={selected}>
      <ReactFlow
        aria-label={t("aria")}
        nodes={toFlowNodes(graph.nodes, nodePorts(graph))}
        edges={toFlowEdges(graph.edges)}
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
        proOptions={PRO_OPTIONS}
        onNodeClick={selectNode}
      >
        <Background variant={BackgroundVariant.Dots} gap={DOT_GAP} size={1} color="var(--border)" bgColor="var(--background-subtle)" />
        <FocusedNode graph={graph} selected={selected} />
        <Panel position="top-right" className="m-3.5">
          <Legend open={legend} onToggle={onToggleLegend} />
        </Panel>
        <Panel position="bottom-left" className="m-3">
          <ZoomControl fitOptions={fitOptions} />
        </Panel>
      </ReactFlow>
    </SelectedNodeContext>
  )
}
