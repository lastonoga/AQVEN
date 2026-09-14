import { isRecord, stringAt } from "./guards.js"
import type { Ir, IrNode } from "../api/types.js"
import type { RefContext } from "./types.js"

export const findNode = (ir: Ir, nodeId: string, context: RefContext = {}): IrNode | null => {
  if (nodeId === "") return null
  const component = context.component === undefined ? undefined : ir.components[context.component]
  const scoped = component?.nodes[nodeId]
  if (scoped !== undefined) return scoped
  return ir.nodes[nodeId] ?? null
}

export const outTypeOf = (node: IrNode | null): string => {
  if (node === null) return ""
  const out = node["out"]
  if (typeof out === "string") return out
  if (!isRecord(out)) return ""
  const named = stringAt(out, "name")
  return named === "" ? stringAt(out, "type") : named
}

export const descriptionOf = (node: IrNode | null): string =>
  node === null ? "" : stringAt(node, "description")

export const itemTypeOf = (node: IrNode | null): string =>
  node === null ? "" : stringAt(node, "itemType")

export const kindOf = (node: IrNode | null): string => (node === null ? "" : node.kind)
