import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from "@xyflow/react"
import type { Edge } from "@xyflow/react"
import { buildFrame, buildScene } from "./scene.js"
import { placeGraph } from "./frame-layout.js"
import { labelEdges } from "./edges.js"
import { defaultEdgeOptions, edgeTypes } from "./edge-types.js"
import { toggleIn, GroupCollapseProvider } from "./collapse.js"
import { FlowNode } from "./FlowNode.js"
import { FanNode } from "./FanNode.js"
import { GroupNode } from "./GroupNode.js"
import { GraphLegend } from "./GraphLegend.js"
import { StageColumns } from "./StageColumns.js"
import { StageRail } from "./StageRail.js"
import { StageHoverProvider } from "./stage-hover.js"
import type { CanvasNode } from "./scene.js"
import type { Size } from "./layout.js"
import type { Ir } from "../api/types.js"

const nodeTypes = { wf: FlowNode, fan: FanNode, wfgroup: GroupNode }

const FIT_VIEW = { padding: 0.06, maxZoom: 1, minZoom: 0.1 }

const MIN_ZOOM = 0.1

const VIRTUALIZE_FROM = 200

const REFIT_DELAY = 90

const MINIMAP_COLORS: Record<string, string> = { wfgroup: "#134e4a", fan: "#0f766e", wf: "#334155" }

const measuredSizes = (
  nodes: readonly CanvasNode[],
  sized: ReadonlySet<string>,
): Map<string, Size> => {
  const sizes = new Map<string, Size>()
  for (const node of nodes) {
    if (!sized.has(node.id)) continue
    const width = node.measured?.width
    const height = node.measured?.height
    if (width === undefined || height === undefined) continue
    if (width === 0 || height === 0) continue
    sizes.set(node.id, { width: Math.round(width), height: Math.round(height) })
  }
  return sizes
}

const sameSizes = (left: ReadonlyMap<string, Size>, right: ReadonlyMap<string, Size>): boolean => {
  if (left.size !== right.size) return false
  for (const [id, size] of left) {
    const other = right.get(id)
    if (other === undefined) return false
    if (other.width !== size.width || other.height !== size.height) return false
  }
  return true
}

type Props = { ir: Ir; selectedId: string | null; onSelect: (id: string | null) => void }

function FlowScene({ ir, selectedId, onSelect }: Props) {
  const scene = useMemo(() => buildScene(ir), [ir])
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [measured, setMeasured] = useState<ReadonlyMap<string, Size>>(() => new Map())

  useEffect(() => {
    setCollapsed(new Set())
    setMeasured(new Map())
  }, [scene])

  const frame = useMemo(() => buildFrame(scene, collapsed, measured), [scene, collapsed, measured])
  const labelled = useMemo(
    () =>
      labelEdges(
        frame.edges,
        placeGraph(scene.graph, collapsed, measured).layout.rects,
        new Set(scene.groupIds.filter((id) => !collapsed.has(id))),
      ),
    [frame, scene, collapsed, measured],
  )
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(frame.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(labelled)

  useEffect(() => {
    setNodes(frame.nodes)
    setEdges(labelled)
  }, [frame, labelled, setNodes, setEdges])

  const initialized = useNodesInitialized()

  useEffect(() => {
    if (!initialized) return
    const next = measuredSizes(nodes, frame.sized)
    if (next.size === 0) return
    if (sameSizes(next, measured)) return
    setMeasured(next)
  }, [initialized, nodes, frame.sized, measured])

  const { fitView } = useReactFlow()

  useEffect(() => {
    if (!initialized) return undefined
    const timer = setTimeout(() => void fitView(FIT_VIEW), REFIT_DELAY)
    return () => clearTimeout(timer)
  }, [collapsed, initialized, fitView])

  const toggle = useCallback((id: string) => setCollapsed((current) => toggleIn(current, id)), [])
  const collapseValue = useMemo(() => ({ collapsed, toggle }), [collapsed, toggle])
  const expandAll = useCallback(() => setCollapsed(new Set()), [])
  const collapseAll = useCallback(() => setCollapsed(new Set(scene.collapsibleIds)), [scene])

  const painted = useMemo(
    () => nodes.map((node) => ({ ...node, selected: node.id === selectedId })),
    [nodes, selectedId],
  )

  return (
    <StageHoverProvider>
      <GroupCollapseProvider value={collapseValue}>
        <div className="flex h-full min-h-0 flex-col">
          <StageRail stages={scene.ranking.stages} columns={frame.columns} />
          <GraphLegend
            groups={scene.collapsibleIds.length}
            collapsedCount={collapsed.size}
            onExpandAll={expandAll}
            onCollapseAll={collapseAll}
          />
          <div className="min-h-0 flex-1">
            <ReactFlow<CanvasNode, Edge>
              nodes={painted}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              edgesFocusable={false}
              onNodeClick={(_, node) => onSelect(node.id)}
              onPaneClick={() => onSelect(null)}
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={defaultEdgeOptions}
              elevateEdgesOnSelect
              onlyRenderVisibleElements={painted.length > VIRTUALIZE_FROM}
              fitView
              fitViewOptions={FIT_VIEW}
              minZoom={MIN_ZOOM}
              maxZoom={2}
              colorMode="dark"
              zIndexMode="manual"
            >
              <StageColumns columns={frame.columns} />
              <Background color="#1e293b" gap={20} />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                maskColor="rgba(2,6,23,0.7)"
                nodeColor={(node) => MINIMAP_COLORS[node.type ?? "wf"] ?? "#334155"}
              />
            </ReactFlow>
          </div>
        </div>
      </GroupCollapseProvider>
    </StageHoverProvider>
  )
}

export function FlowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowScene {...props} />
    </ReactFlowProvider>
  )
}
