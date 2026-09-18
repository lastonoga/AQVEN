import { isJsonObject } from "@/features/nodes"

type JsonObject = Readonly<Record<string, unknown>>

export type SchemaEnum = { readonly path: string; readonly values: readonly string[] }

const record = (value: unknown): JsonObject | null => isJsonObject(value) ? value : null

const text = (value: unknown): string | null => typeof value === "string" ? value : null

const enumValues = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []

export const schemaEnums = (schema: unknown): readonly SchemaEnum[] => {
  const root = record(schema)
  if (root === null) return []
  const definitions = record(root["$defs"])
  const found: SchemaEnum[] = []
  const walk = (value: unknown, path: string, refs: ReadonlySet<string>): void => {
    const node = record(value)
    if (node === null) return
    const values = enumValues(node["enum"])
    if (path.length > 0 && values.length > 0) found.push({ path, values })
    const ref = text(node["$ref"])
    if (ref !== null && ref.startsWith("#/$defs/") && !refs.has(ref)) {
      walk(definitions?.[ref.slice("#/$defs/".length)], path, new Set([...refs, ref]))
    }
    const properties = record(node["properties"])
    if (properties !== null) {
      for (const [name, child] of Object.entries(properties)) walk(child, path.length === 0 ? name : `${path}.${name}`, refs)
    }
    if (node["items"] !== undefined) walk(node["items"], `${path}[]`, refs)
    for (const key of ["anyOf", "oneOf", "allOf"]) {
      const options = node[key]
      if (Array.isArray(options)) options.forEach((option) => { walk(option, path, refs) })
    }
  }
  walk(root, "", new Set())
  return found.filter((item, index) => found.findIndex((candidate) => candidate.path === item.path) === index)
}
