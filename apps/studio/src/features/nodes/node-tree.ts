import type { ApiNode } from "@/domain"
import { joinMeta } from "@/lib/format"

export type NodeTreeRow = { readonly node: ApiNode; readonly depth: number }

const rootDepth = 0

const depthOf = (node: ApiNode, depths: ReadonlyMap<string, number>): number => {
  if (node.parent === null) return rootDepth
  return (depths.get(node.parent) ?? rootDepth) + 1
}

export const nodeTree = (nodes: readonly ApiNode[]): readonly NodeTreeRow[] => {
  const depths = new Map<string, number>()
  return nodes.map((node) => {
    const depth = depthOf(node, depths)
    depths.set(node.node_id, depth)
    return { node, depth }
  })
}

export const childNodes = (nodes: readonly ApiNode[], nodeId: string): readonly ApiNode[] =>
  nodes.filter((node) => node.parent === nodeId)

export const functionName = (ref: string): string => ref.slice(ref.lastIndexOf(":") + 1)

export const fileStem = (path: string): string => {
  const name = path.slice(path.lastIndexOf("/") + 1)
  const dot = name.indexOf(".")
  return dot === -1 ? name : name.slice(0, dot)
}

export const nodeSubtitle = (node: ApiNode): string | null => {
  if (node.agent !== null) return joinMeta([node.agent, node.inference])
  if (node.code_ref !== null) return functionName(node.code_ref)
  return null
}
