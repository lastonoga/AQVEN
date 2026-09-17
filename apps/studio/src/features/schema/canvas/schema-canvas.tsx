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
import type { NodeId, SchemaGraph } from "@/domain"
import { nodeId } from "@/data/ids"
import { AnchorNode } from "./anchor-node"
import { FlowEdge } from "./flow-edge"
import { GatewayNode } from "./gateway-node"
import { GroupNode } from "./group-node"
import { Legend } from "./legend"
import { SelectedNodeContext } from "./selection"
import { StageSpotlight } from "./stage-spotlight"
import { StepNode } from "./step-node"
import { findStage, fitViewOptions, toFlowEdges, toFlowNodes, type SchemaFlowNode } from "./to-flow"
import { MAX_ZOOM, MIN_ZOOM } from "./viewport"
import { ZoomControl } from "./zoom-control"

export type SchemaCanvasProps = {
  readonly graph: SchemaGraph
  readonly selected: NodeId | null
  readonly stage: number | null
  readonly legend: boolean
  readonly onSelect: (node: NodeId) => void
  readonly onToggleLegend: () => void
}

const NODE_TYPES = { step: StepNode, container: GroupNode, gateway: GatewayNode, anchor: AnchorNode } satisfies NodeTypes
const EDGE_TYPES = { flow: FlowEdge } satisfies EdgeTypes
const PRO_OPTIONS: ProOptions = { hideAttribution: true }
const DOT_GAP = 24

export function SchemaCanvas({ graph, selected, stage, legend, onSelect, onToggleLegend }: SchemaCanvasProps) {
  const t = useTranslations("schema.canvas")
  const nodes = toFlowNodes(graph.nodes)
  const edges = toFlowEdges(graph.edges)
  const fitOptions = fitViewOptions(graph.nodes)
  const selectNode: NodeMouseHandler<SchemaFlowNode> = (_event, node) => {
    if (node.selectable !== true) return
    onSelect(nodeId(node.id))
  }
  return (
    <SelectedNodeContext value={selected}>
      <ReactFlow
        aria-label={t("aria")}
        nodes={nodes}
        edges={edges}
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
        <StageSpotlight stage={findStage(graph.stages, stage)} />
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
