import type { Ir, IrNode } from "../api/index.js"

export type SlotSource =
  | { origin: "node"; node: string; path: string }
  | { origin: "input"; path: string }
  | { origin: "item"; path: string }
  | { origin: "const"; value: unknown }
  | { origin: "inline"; value: unknown }

export type Slot = { name: string; source: SlotSource; raw: unknown }

const REF = /^\$([A-Za-z_][A-Za-z0-9_]*)(.*)$/

const rootOrigins: Record<string, "input" | "item"> = {
  input: "input",
  in: "input",
  item: "item",
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const stripHead = (rest: string): string => (rest.startsWith(".") ? rest.slice(1) : rest)

const parseRefString = (value: string, known: ReadonlySet<string>): SlotSource => {
  const match = REF.exec(value)
  if (match === null) return { origin: "inline", value }
  const head = match[1] ?? ""
  const path = stripHead(match[2] ?? "")
  if (known.has(head)) return { origin: "node", node: head, path }
  if (rootOrigins[head] === "item") return { origin: "item", path }
  if (rootOrigins[head] === "input") return { origin: "input", path }
  return { origin: "inline", value }
}

export const parseSlotValue = (value: unknown, known: ReadonlySet<string>): SlotSource => {
  if (typeof value === "string") return parseRefString(value, known)
  if (isRecord(value) && "const" in value) return { origin: "const", value: value["const"] }
  if (isRecord(value) && typeof value["node"] === "string")
    return { origin: "node", node: String(value["node"]), path: "" }
  return { origin: "inline", value }
}

export const outTypeName = (node: IrNode | undefined): string => {
  const out = node?.["out"]
  if (typeof out === "string") return out
  if (isRecord(out) && typeof out["name"] === "string") return out["name"]
  return ""
}

const withPath = (base: string, path: string): string => {
  if (base === "") return path
  if (path === "") return base
  return `${base}.${path}`
}

const dropOutPrefix = (path: string): string => {
  if (path === "out") return ""
  if (path.startsWith("out.")) return path.slice(4)
  return path
}

const constTypes: Record<string, string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  object: "object",
}

export const slotTypeLabel = (source: SlotSource, ir: Ir | null, itemType: string): string => {
  if (source.origin === "node") return withPath(outTypeName(ir?.nodes[source.node]), dropOutPrefix(source.path))
  if (source.origin === "input") return withPath(ir?.input ?? "", source.path)
  if (source.origin === "item") return withPath(itemType, source.path)
  if (source.origin === "const") return constTypes[typeof source.value] ?? ""
  return ""
}

export const nodeIds = (ir: Ir | null): ReadonlySet<string> =>
  new Set(ir === null ? [] : Object.keys(ir.nodes))

export const stepOf = (ir: Ir | null, nodeId: string): number => {
  if (ir === null) return 0
  return Object.keys(ir.nodes).indexOf(nodeId) + 1
}

export const embeddedLlm = (body: IrNode): { body: IrNode; nested: boolean } | null => {
  if (body.kind === "llm") return { body, nested: false }
  const inner = body["do"]
  if (isRecord(inner) && inner["kind"] === "llm") return { body: inner as IrNode, nested: true }
  return null
}

export const itemTypeOf = (body: IrNode): string =>
  typeof body["itemType"] === "string" ? body["itemType"] : ""
