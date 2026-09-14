import { expandIr, rootEdgesOf, rootNodesOf } from "./expand.js"
import { rankNodes } from "./ranks.js"
import { toFlowEdge } from "./edges.js"
import { columnsOf } from "./layout.js"
import { canvasKindOf, fallbackSize, groupIdsOf, placeGraph } from "./frame-layout.js"
import type { Edge } from "@xyflow/react"
import type { Ir } from "../api/types.js"
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

const toCanvasNode = (
  node: ExpandedNode,
  position: { x: number; y: number },
  size: Size,
  collapsed: boolean,
  stage: number,
): CanvasNode => {
  const shared = {
    id: node.id,
    position,
    parentId: node.parentId ?? undefined,
    extent: node.parentId === null ? undefined : ("parent" as const),
    draggable: false,
  }
  const kind = canvasKindOf(node)

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

  return {
    nodes,
    edges: placement.edges.map(toFlowEdge),
    columns: columnsOf(layout.rects, scene.ranking.rankOf, scene.rootIds),
    sized: placement.sized,
  }
}
