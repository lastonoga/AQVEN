import { expandIr } from "./expand.js"
import type { Ir, IrNode } from "../api/types.js"

export type NodePick = {
  id: string
  label: string
  parentId: string | null
  rootId: string
  body: IrNode | null
}

export type NodeIndex = ReadonlyMap<string, NodePick>

export const nodeIndexOf = (ir: Ir): NodeIndex =>
  new Map(
    expandIr(ir).nodes.map((node) => [
      node.id,
      { id: node.id, label: node.label, parentId: node.parentId, rootId: node.rootId, body: node.body },
    ]),
  )

const inherited = (index: NodeIndex, id: string): IrNode | null => {
  let cursor: string | null = id
  while (cursor !== null) {
    const pick: NodePick | undefined = index.get(cursor)
    if (pick === undefined) return null
    if (pick.body !== null) return pick.body
    cursor = pick.parentId
  }
  return null
}

export const bodyAt = (ir: Ir, index: NodeIndex, id: string | null): IrNode | null => {
  if (id === null) return null
  return ir.nodes[id] ?? inherited(index, id)
}

export const runIdAt = (index: NodeIndex, id: string | null): string | null => {
  if (id === null) return null
  return index.get(id)?.rootId ?? id
}
