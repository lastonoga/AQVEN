import type { IrNode } from "../api/types.js"

const REF_HEAD = /^\$([A-Za-z_][A-Za-z0-9_]*)/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const nodeRefTarget = (value: Record<string, unknown>): string | null =>
  typeof value["node"] === "string" ? value["node"] : null

const fromString = (value: string, known: ReadonlySet<string>, found: Set<string>): void => {
  const head = REF_HEAD.exec(value)?.[1]
  if (head === undefined) return
  if (!known.has(head)) return
  found.add(head)
}

const collect = (value: unknown, known: ReadonlySet<string>, found: Set<string>): void => {
  if (typeof value === "string") return fromString(value, known, found)
  if (Array.isArray(value)) return value.forEach((item) => collect(item, known, found))
  if (!isRecord(value)) return
  const target = nodeRefTarget(value)
  if (target !== null && known.has(target)) found.add(target)
  Object.values(value).forEach((item) => collect(item, known, found))
}

export const sourcesOf = (body: IrNode, known: ReadonlySet<string>): string[] => {
  const found = new Set<string>()
  collect(body, known, found)
  return [...found]
}

export const caseLabelsOf = (body: IrNode, known: ReadonlySet<string>): Map<string, string> => {
  const labels = new Map<string, string>()
  const cases = body["cases"]
  if (!isRecord(cases)) return labels
  for (const [label, value] of Object.entries(cases)) {
    const found = new Set<string>()
    collect(value, known, found)
    for (const source of found) if (!labels.has(source)) labels.set(source, label)
  }
  return labels
}

export const refText = (value: unknown): string => {
  if (typeof value === "string" && value.startsWith("$")) return value.slice(1)
  if (typeof value === "string") return value
  if (!isRecord(value)) return "—"
  if (typeof value["node"] === "string") return value["node"]
  if ("const" in value) return "константа"
  return "—"
}
