import type { IrNode } from "../api/types.js"

export type Fact = { label: string; value: string }

export type InputRef = { slot: string; source: string }

export type NestedNode = {
  kind: string
  name: string
  facts: Fact[]
  inputs: InputRef[]
}

export type NodeFacts = {
  facts: Fact[]
  inputs: InputRef[]
  outputType: string
  nested: NestedNode | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const text = (node: IrNode, key: string): string => {
  const value = node[key]
  return typeof value === "string" ? value : ""
}

const flag = (node: IrNode, key: string): string => {
  const value = node[key]
  if (value === true) return "да"
  if (value === false) return "нет"
  return "—"
}

const count = (node: IrNode, key: string): number => {
  const value = node[key]
  return isRecord(value) ? Object.keys(value).length : 0
}

const numberText = (node: IrNode, key: string): string => {
  const value = node[key]
  return typeof value === "number" ? String(value) : "—"
}

const duration = (seconds: number): string => {
  if (seconds >= 3600) return `${Math.round(seconds / 3600)} ч`
  if (seconds >= 60) return `${Math.round(seconds / 60)} мин`
  return `${seconds} с`
}

const durationText = (node: IrNode, key: string): string => {
  const value = node[key]
  return typeof value === "number" ? duration(value) : "—"
}

const millisText = (node: IrNode, key: string): string => {
  const value = node[key]
  if (typeof value !== "number") return "—"
  return value >= 1000 ? `${value / 1000} с` : `${value} мс`
}

const sourceText = (value: unknown): string => {
  if (typeof value === "string" && value.startsWith("$")) return value.slice(1)
  if (typeof value === "string") return value
  if (!isRecord(value)) return "—"
  if (typeof value["node"] === "string") return value["node"]
  if ("const" in value) return "константа"
  return "—"
}

const dash = (value: string): string => (value === "" ? "—" : value)

const typeArgText = (node: IrNode): string => {
  const args = node["typeArgs"]
  if (!Array.isArray(args)) return ""
  return args.filter((item): item is string => typeof item === "string").join(", ")
}

const factsByKind: Record<string, (node: IrNode) => Fact[]> = {
  llm: (node) => [
    { label: "роль модели", value: dash(text(node, "modelRole")) },
    { label: "промт", value: dash(text(node, "fn")) },
  ],
  tool: (node) => [
    { label: "тул", value: dash(text(node, "tool")) },
    { label: "эффект", value: dash(text(node, "effect")) },
  ],
  code: (node) => [
    { label: "функция", value: dash(text(node, "fn")) },
    { label: "чистая", value: flag(node, "pure") },
  ],
  map: (node) => [
    { label: "параллельно", value: numberText(node, "concurrency") },
    { label: "при ошибке", value: dash(text(node, "onItemError")) },
  ],
  switch: (node) => [
    { label: "по полю", value: sourceText(node["on"]) },
    { label: "веток", value: `${count(node, "cases")}${node["default"] === null ? "" : " + default"}` },
  ],
  human: (node) => [
    { label: "форма", value: dash(text(node, "form")) },
    { label: "таймаут", value: durationText(node, "timeoutSeconds") },
  ],
  call: (node) => [
    { label: "компонент", value: dash(text(node, "component")) },
    { label: "тип", value: dash(typeArgText(node)) },
  ],
  loop: (node) => [
    { label: "выбор", value: dash(text(node, "select")) },
    { label: "итераций", value: numberText(node, "maxIter") },
  ],
}

const inputsByKind: Record<string, (node: IrNode) => InputRef[]> = {
  switch: (node) => {
    const cases = node["cases"]
    const head: InputRef[] = [{ slot: "on", source: sourceText(node["on"]) }]
    if (!isRecord(cases)) return head
    const branches = Object.entries(cases).map(([slot, value]) => ({ slot, source: sourceText(value) }))
    return [...head, ...branches]
  },
  map: (node) => [{ slot: "over", source: sourceText(node["over"]) }],
}

const defaultInputs = (node: IrNode): InputRef[] => {
  const slots = node["in"]
  if (!isRecord(slots)) return []
  return Object.entries(slots).map(([slot, value]) => ({ slot, source: sourceText(value) }))
}

const outputByKind: Record<string, (node: IrNode) => string> = {
  call: (node) => {
    const out = node["out"]
    if (!isRecord(out)) return "—"
    return typeof out["name"] === "string" ? out["name"] : "—"
  },
  map: (node) => {
    const itemType = text(node, "itemType")
    return itemType === "" ? "—" : `${itemType}[]`
  },
  switch: (node) => dash(text(node, "onType")),
}

const defaultOutput = (node: IrNode): string => dash(text(node, "out"))

const nestedName = (node: IrNode): string => {
  const candidates = ["fn", "tool", "component", "form"]
  const found = candidates.map((key) => text(node, key)).find((value) => value !== "")
  return found ?? node.kind
}

const factsOf = (node: IrNode): Fact[] => (factsByKind[node.kind] ?? (() => []))(node)

const inputsOf = (node: IrNode): InputRef[] => (inputsByKind[node.kind] ?? defaultInputs)(node)

const outputOf = (node: IrNode): string => (outputByKind[node.kind] ?? defaultOutput)(node)

const nestedOf = (node: IrNode): NestedNode | null => {
  const body = node["do"]
  if (!isRecord(body)) return null
  if (typeof body["kind"] !== "string") return null
  const inner = body as IrNode
  return { kind: inner.kind, name: nestedName(inner), facts: factsOf(inner), inputs: inputsOf(inner) }
}

export const nodeFacts = (node: IrNode): NodeFacts => ({
  facts: factsOf(node),
  inputs: inputsOf(node),
  outputType: outputOf(node),
  nested: nestedOf(node),
})

export const extraFacts = (node: IrNode): Fact[] => {
  const optional: Fact[] = []
  if (typeof node["timeoutMs"] === "number") optional.push({ label: "таймаут", value: millisText(node, "timeoutMs") })
  if (typeof node["ttlSeconds"] === "number") optional.push({ label: "кеш", value: durationText(node, "ttlSeconds") })
  if (typeof node["maxItems"] === "number") optional.push({ label: "макс. элементов", value: numberText(node, "maxItems") })
  return optional
}
