export type SchemaNode = Readonly<Record<string, unknown>>

export const isRecord = (value: unknown): value is SchemaNode =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export type JsonData = null | boolean | number | string | JsonData[] | { [key: string]: JsonData }

export const isJsonValue = (value: unknown): value is JsonData =>
  value === null || typeof value === "string" || typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value)) ||
  (Array.isArray(value) && value.every(isJsonValue)) ||
  (isRecord(value) && Object.values(value).every(isJsonValue))

const editablePath = (path: string): string => path.replace(/\[[^\]]*\].*$/, "")

export const selectedInputPaths = (paths: readonly string[]): readonly string[] =>
  paths.flatMap((path) => {
    if (path === "$input") return [""]
    if (path.startsWith("$input.")) return [editablePath(path.slice("$input.".length))]
    return path.startsWith("$") ? [] : [editablePath(path)]
  })

const ancestorOf = (parent: string, child: string): boolean =>
  parent === "" || parent === child || child.startsWith(`${parent}.`)

export const fieldIsVisible = (path: string, selectedPaths: readonly string[]): boolean =>
  selectedInputPaths(selectedPaths).some((selected) => ancestorOf(path, selected) || ancestorOf(selected, path))

const selectedValue = (value: unknown, path: string, paths: readonly string[]): unknown => {
  if (paths.some((selected) => ancestorOf(selected, path))) return value
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value).flatMap(([key, item]) => {
    const nextPath = path === "" ? key : `${path}.${key}`
    if (!paths.some((selected) => ancestorOf(nextPath, selected))) return []
    const projected = selectedValue(item, nextPath, paths)
    return projected === undefined ? [] : [[key, projected] as const]
  })
  return entries.length === 0 ? undefined : Object.fromEntries(entries)
}

export const projectManualInput = (value: Record<string, unknown>, selectedPaths: readonly string[]): Record<string, unknown> => {
  const projected = selectedValue(value, "", selectedInputPaths(selectedPaths))
  return isRecord(projected) ? projected : {}
}

export const schemaVariants = (schema: unknown): readonly SchemaNode[] => {
  if (!isRecord(schema)) return []
  const variants = schema["oneOf"] ?? schema["anyOf"]
  if (Array.isArray(variants)) return variants.filter(isRecord)
  return [schema]
}

export const schemaProperties = (schema: unknown): SchemaNode => {
  const variants = schemaVariants(schema).filter((variant) => variant["type"] !== "null")
  const entries = variants.flatMap((variant) => isRecord(variant["properties"]) ? Object.entries(variant["properties"]) : [])
  return Object.fromEntries(entries)
}

export const schemaAtPath = (schema: unknown, path: string): unknown => {
  let current: unknown = schema
  for (const part of path.split(".")) {
    const variant = schemaVariants(current).find((candidate) => isRecord(candidate["properties"]) && part in candidate["properties"])
    if (variant === undefined) return null
    const properties = variant["properties"]
    if (!isRecord(properties)) return null
    current = properties[part]
  }
  return current
}

export const schemaType = (schema: unknown): SchemaNode | null =>
  schemaVariants(schema).find((candidate) => candidate["type"] !== "null") ?? null

export const nullableSchema = (schema: unknown): boolean =>
  schemaVariants(schema).some((candidate) => candidate["type"] === "null")

export const getPath = (value: unknown, path: string): unknown =>
  path === "" ? value : path.split(".").reduce<unknown>((current, segment) => isRecord(current) ? current[segment] : undefined, value)

export const setPath = (value: Record<string, unknown>, path: string, next: unknown): Record<string, unknown> => {
  const [head, ...rest] = path.split(".")
  if (head === undefined) return value
  if (rest.length === 0) return { ...value, [head]: next }
  const current = value[head]
  return { ...value, [head]: setPath(isRecord(current) ? current : {}, rest.join("."), next) }
}

export const requiredAtPath = (root: unknown, path: string): boolean => {
  const parts = path.split(".")
  const key = parts.pop()
  const parent = parts.length === 0 ? root : schemaAtPath(root, parts.join("."))
  return key !== undefined && schemaVariants(parent).some((variant) =>
    Array.isArray(variant["required"]) && variant["required"].includes(key))
}

export function initialManualInput(schema: unknown): Record<string, unknown> {
  const variants = schemaVariants(schema).filter((variant) => variant["type"] !== "null")
  const chosen = variants[0] ?? schema
  const properties = schemaProperties(chosen)
  const entries: [string, unknown][] = []
  for (const [key, member] of Object.entries(properties)) {
    const typedMember = schemaType(member)
    if (typedMember?.["const"] !== undefined) { entries.push([key, typedMember["const"]]); continue }
    if (nullableSchema(member)) { entries.push([key, null]); continue }
    const typed = typedMember
    if (typed?.["type"] === "boolean") entries.push([key, false])
    else if (typed?.["type"] === "array") entries.push([key, []])
    else if (typed?.["type"] === "object" || Object.keys(schemaProperties(member)).length > 0) entries.push([key, initialManualInput(member)])
  }
  return Object.fromEntries(entries)
}

export const missingManualInput = (schema: unknown, paths: readonly string[], value: Record<string, unknown>): readonly string[] => {
  const checked = new Set<string>()
  const visit = (path: string, node: unknown): void => {
    const current = getPath(value, path)
    if (current === null && nullableSchema(node)) return
    const typed = schemaType(node)
    if ((typed?.["type"] === "object" || Object.keys(schemaProperties(node)).length > 0) && !isRecord(current)) {
      checked.add(path)
    } else if (typed?.["type"] === "object" || Object.keys(schemaProperties(node)).length > 0) {
      const variants = schemaVariants(node).filter((variant) => variant["type"] !== "null")
      const branch = variants.find((variant) => {
        const kind = schemaProperties(variant)["kind"]
        return isRecord(kind) && kind["const"] === (isRecord(current) ? current["kind"] : undefined)
      }) ?? variants[0] ?? node
      for (const [key, child] of Object.entries(schemaProperties(branch))) {
        const childPath = path ? `${path}.${key}` : key
        if (fieldIsVisible(childPath, paths) && requiredAtPath(schema, childPath)) visit(childPath, child)
      }
    } else if (current === undefined || current === "" || (typed?.["type"] === "array" && !Array.isArray(current)) || (typeof typed?.["pattern"] === "string" && typeof current === "string" && !new RegExp(typed["pattern"]).test(current))) checked.add(path)
  }
  for (const relative of selectedInputPaths(paths)) {
    visit(relative, relative === "" ? schema : schemaAtPath(schema, relative))
  }
  return [...checked]
}
