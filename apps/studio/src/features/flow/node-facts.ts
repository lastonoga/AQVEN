import type { ApiNode, ApiNodeDetail } from "@/domain"

const functionName = (ref: string): string => ref.slice(ref.lastIndexOf(":") + 1)

export const nodeSubtitle = (node: ApiNode): string | null => {
  if (node.agent !== null) return node.inference === null ? node.agent : `${node.agent} · ${node.inference}`
  if (node.code_ref !== null) return functionName(node.code_ref)
  return null
}

export type SpecFact = { readonly key: string; readonly value: string }

const FACT_KEYS: readonly string[] = [
  "tool",
  "form",
  "assignee",
  "timeout_seconds",
  "over",
  "concurrency",
  "body",
  "join",
  "on_item_error",
  "max_iter",
  "select",
  "stop",
  "on",
  "cases",
  "flow",
  "from",
  "to",
  "agent",
  "inference",
]

export const jsonText = (value: unknown): string => JSON.stringify(value, null, 2)

const factText = (value: unknown): string => {
  if (typeof value === "string") return value.startsWith("@") && value.includes(":") ? value.slice(value.lastIndexOf(":") + 1) : value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.map(factText).join(", ")
  if (value !== null && typeof value === "object") {
    return Object.entries(value).map(([key, part]) => `${key}: ${factText(part)}`).join(", ")
  }
  return String(value)
}

export const specFacts = (detail: ApiNodeDetail): readonly SpecFact[] => {
  const spec: Readonly<Record<string, unknown>> = detail.spec
  return FACT_KEYS.flatMap((key) => {
    const value = spec[key]
    if (value === undefined || value === null) return []
    const text = factText(value)
    return text === "" ? [] : [{ key, value: text }]
  })
}

export const specDescription = (detail: ApiNodeDetail): string => detail.spec.description
