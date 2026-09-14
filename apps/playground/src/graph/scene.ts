import { expandIr, rootEdgesOf, rootNodesOf } from "./expand.js"
import { rankNodes } from "./ranks.js"
import { toFlowEdge } from "./edges.js"
import { columnsOf } from "./layout.js"
import { canvasKindOf, fallbackSize, groupIdsOf, placeGraph } from "./frame-layout.js"
import type { Edge } from "@xyflow/react"
import type { Ir } from "../api/types.js"
import type { CanvasKind } from "./frame-layout.js"
import type { ExpandedGraph, ExpandedNode } from "./expand.js"
import type { ColumnBox, Size } from "./layout.js"
import type { Ranking } from "./ranks.js"
import type { FlowNodeType } from "./FlowNode.js"
import type { GroupNodeType } from "./GroupNode.js"
import type { FanNodeType } from "./FanNode.js"

export type CanvasNode = FlowNodeType | GroupNodeType | FanNodeType

export type Scene = {
  graph: ExpandedGraph
  ranking: Ranking
  rootIds: string[]
  rootOf: Map<string, string>
  groupIds: string[]
}

export type Frame = {
  nodes: CanvasNode[]
  edges: Edge[]
  columns: ColumnBox[]
  sized: Set<string>
}

export const buildScene = (ir: Ir): Scene => {
  const graph = expandIr(ir)
  const roots = rootNodesOf(graph)
  return {
    graph,
    ranking: rankNodes(roots, rootEdgesOf(graph)),
    rootIds: roots.map((node) => node.id),
    rootOf: new Map(graph.nodes.map((node) => [node.id, node.rootId])),
    groupIds: groupIdsOf(graph),
  }
}

const LAYER_SPAN = 10
const CARD_LIFT = 4
const EDGE_DROP = 4

export const frameZ = (depth: number): number => (depth + 1) * LAYER_SPAN

export const cardZ = (depth: number): number => frameZ(depth) + CARD_LIFT

export const edgeZ = (depth: number): number => frameZ(depth) - EDGE_DROP

const layerOf = (kind: CanvasKind, depth: number, collapsed: boolean): number => {
  if (kind !== "wfgroup") return cardZ(depth)
  return collapsed ? cardZ(depth) : frameZ(depth)
}

const toCanvasNode = (
  node: ExpandedNode,
  position: { x: number; y: number },
  size: Size,
  collapsed: boolean,
  stage: number,
): CanvasNode => {
  const kind = canvasKindOf(node)
  const shared = {
    id: node.id,
    position,
    parentId: node.parentId ?? undefined,
    extent: node.parentId === null ? undefined : ("parent" as const),
    draggable: false,
    zIndex: layerOf(kind, node.depth, collapsed),
  }

  if (kind === "fan") {
    return { ...shared, type: "fan", data: { label: node.label, note: node.note, kind: node.kind } }
  }
  if (kind === "wfgroup" && node.group !== null) {
    return {
      ...shared,
      type: "wfgroup",
      style: { width: size.width, height: size.height },
      data: { label: node.label, kind: node.kind, stage, group: node.group, collapsed },
    }
  }
  return {
    ...shared,
    type: "wf",
    data: {
      stage,
      kind: node.kind,
      label: node.label,
      note: node.note,
      description: node.info.description,
      facts: node.info.facts,
      inputs: node.info.inputs,
      outputType: node.info.outputType,
      nested: node.info.nested,
      height: size.height,
    },
  }
}

export const buildFrame = (
  scene: Scene,
  collapsed: ReadonlySet<string>,
  measured: ReadonlyMap<string, Size>,
): Frame => {
  const placement = placeGraph(scene.graph, collapsed, measured)
  const { layout } = placement

  const nodes = [...placement.visible]
    .sort((left, right) => left.depth - right.depth)
    .map((node) =>
      toCanvasNode(
        node,
        layout.offsets.get(node.id) ?? { x: 0, y: 0 },
        layout.sizes.get(node.id) ?? fallbackSize(node, collapsed.has(node.id)),
        collapsed.has(node.id),
        node.parentId === null ? scene.ranking.rankOf.get(node.id) ?? 0 : -1,
      ),
    )

  const depthOf = new Map(placement.visible.map((node) => [node.id, node.depth]))
  const spanOf = (source: string, target: string): number =>
    Math.min(depthOf.get(source) ?? 0, depthOf.get(target) ?? 0)

  return {
    nodes,
    edges: placement.edges.map((edge) => ({
      ...toFlowEdge({ ...edge, points: layout.routes.get(edge.id) }),
      zIndex: edgeZ(spanOf(edge.source, edge.target)),
    })),
    columns: columnsOf(layout.rects, scene.ranking.rankOf, scene.rootIds),
    sized: placement.sized,
  }
}
