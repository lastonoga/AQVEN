import type { Ir } from "../api/index.js"

export type SchemaNode = Readonly<Record<string, unknown>>

export type TypeEntry = {
  readonly id: string
  readonly kind: string
  readonly description: string
  readonly schema: SchemaNode | null
  readonly example: unknown
  readonly hasExample: boolean
  readonly source: string
  readonly allowedSet: string
  readonly codeFormat: string
  readonly valueDescriptions: Readonly<Record<string, string>>
}

export type TypeRegistry = Readonly<Record<string, TypeEntry>>

export type TypeContext = {
  readonly registry: TypeRegistry
  readonly defs: Readonly<Record<string, unknown>>
  readonly entry: TypeEntry | null
}

export type TypeLink = {
  readonly expr: string
  readonly root: string
  readonly path: readonly string[]
  readonly entry: TypeEntry | null
  readonly schema: SchemaNode | null
  readonly context: TypeContext
}

export type TypeField = {
  readonly name: string
  readonly schema: SchemaNode | null
  readonly required: boolean
  readonly nullable: boolean
  readonly description: string
}

export type Structure =
  | { readonly shape: "fields"; readonly node: SchemaNode }
  | { readonly shape: "values"; readonly values: readonly string[]; readonly node: SchemaNode }
  | { readonly shape: "none" }

const SCHEMA_KEYS = ["schema", "jsonSchema", "json_schema"]
const DEFS_KEYS = ["$defs", "definitions"]
const ARRAY_SUFFIX = /\[\]$/

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const textAt = (bag: Readonly<Record<string, unknown>>, keys: readonly string[]): string => {
  const hit = keys.map((key) => bag[key]).find((value) => typeof value === "string")
  return typeof hit === "string" ? hit : ""
}

const recordAt = (bag: Readonly<Record<string, unknown>>, keys: readonly string[]): Record<string, unknown> | null =>
  keys.map((key) => bag[key]).find(isRecord) ?? null

const pairIfString = ([key, value]: readonly [string, unknown]): Array<[string, string]> =>
  typeof value === "string" ? [[key, value]] : []

const stringMap = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(pairIfString))
}

const exampleOf = (bag: Readonly<Record<string, unknown>>, schema: SchemaNode | null): [unknown, boolean] => {
  if ("example" in bag) return [bag["example"], true]
  const list = bag["examples"] ?? schema?.["examples"]
  if (Array.isArray(list) && list.length > 0) return [list[0], true]
  return [null, false]
}

const readEntry = (id: string, raw: unknown): TypeEntry => {
  const bag = isRecord(raw) ? raw : {}
  const schema = recordAt(bag, SCHEMA_KEYS)
  const [example, hasExample] = exampleOf(bag, schema)
  const described = textAt(bag, ["description"])
  return {
    id: textAt(bag, ["id", "name"]) === "" ? id : textAt(bag, ["id", "name"]),
    kind: textAt(bag, ["kind"]),
    description: described === "" && schema !== null ? textAt(schema, ["description"]) : described,
    schema,
    example,
    hasExample,
    source: textAt(bag, ["source"]),
    allowedSet: textAt(bag, ["allowedSet", "allowed_set"]),
    codeFormat: textAt(bag, ["codeFormat", "code_format"]),
    valueDescriptions: {
      ...stringMap(schema?.["x-enumDescriptions"]),
      ...stringMap(bag["values"]),
      ...stringMap(bag["valueDescriptions"]),
    },
  }
}

const fromArray = (list: readonly unknown[]): Array<[string, TypeEntry]> =>
  list.map((raw, index): [string, TypeEntry] => {
    const entry = readEntry(`#${index}`, raw)
    return [entry.id, entry]
  })

const fromMap = (bag: Readonly<Record<string, unknown>>): Array<[string, TypeEntry]> =>
  Object.entries(bag).map(([id, raw]): [string, TypeEntry] => [id, readEntry(id, raw)])

export const readRegistry = (ir: Ir | null): TypeRegistry => {
  const source = ir?.types
  if (Array.isArray(source)) return Object.fromEntries(fromArray(source))
  if (isRecord(source)) return Object.fromEntries(fromMap(source))
  return {}
}

const refName = (node: SchemaNode): string => {
  const ref = node["$ref"]
  if (typeof ref !== "string") return ""
  return ref.split("/").filter((part) => part !== "" && part !== "#").pop() ?? ""
}

export const contextOf = (registry: TypeRegistry, entry: TypeEntry | null): TypeContext => {
  const schema = entry === null ? null : entry.schema
  if (schema === null) return { registry, defs: {}, entry }
  return { registry, defs: recordAt(schema, DEFS_KEYS) ?? {}, entry }
}

export const deref = (node: SchemaNode | null, ctx: TypeContext): SchemaNode | null => {
  if (node === null) return null
  const name = refName(node)
  if (name === "") return node
  const local = ctx.defs[name]
  if (isRecord(local)) return local
  return ctx.registry[name]?.schema ?? null
}

export const namedOf = (node: SchemaNode | null, registry: TypeRegistry): string => {
  if (node === null) return ""
  const ref = refName(node)
  if (ref !== "") return ref
  const title = node["title"]
  if (typeof title === "string" && registry[title] !== undefined) return title
  return ""
}

export const itemsOf = (node: SchemaNode | null): SchemaNode | null => {
  if (node === null) return null
  return isRecord(node["items"]) ? node["items"] : null
}

export const typeList = (node: SchemaNode): readonly string[] => {
  const type = node["type"]
  if (typeof type === "string") return [type]
  if (!Array.isArray(type)) return []
  return type.filter((value): value is string => typeof value === "string")
}

const variantsOf = (node: SchemaNode): readonly SchemaNode[] => {
  const list = node["anyOf"] ?? node["oneOf"]
  if (!Array.isArray(list)) return []
  return list.filter(isRecord)
}

const enumLabel = (value: unknown): string => (typeof value === "string" ? value : String(value))

export const enumOf = (node: SchemaNode | null): readonly string[] => {
  const values = node?.["enum"]
  if (!Array.isArray(values)) return []
  return values.map(enumLabel)
}

const MAX_LABEL_DEPTH = 3

const baseLabel = (node: SchemaNode, ctx: TypeContext, depth: number): string => {
  if (Array.isArray(node["enum"])) return `enum(${node["enum"].length})`
  const types = typeList(node).filter((name) => name !== "null")
  const head = types[0] ?? ""
  if (head === "array") return `${labelOf(itemsOf(node), ctx, depth + 1)}[]`
  if (head !== "") return head
  const variants = variantsOf(node)
  if (variants.length > 0) return variants.map((variant) => labelOf(variant, ctx, depth + 1)).join(" | ")
  return "—"
}

export const labelOf = (node: SchemaNode | null, ctx: TypeContext, depth = 0): string => {
  if (node === null) return "—"
  const named = namedOf(node, ctx.registry)
  if (named !== "") return named
  if (depth >= MAX_LABEL_DEPTH) return "…"
  const base = baseLabel(node, ctx, depth)
  return typeList(node).includes("null") ? `${base} | null` : base
}

const requiredOf = (node: SchemaNode): readonly string[] => {
  const required = node["required"]
  if (!Array.isArray(required)) return []
  return required.filter((value): value is string => typeof value === "string")
}

export const fieldsOf = (node: SchemaNode | null, ctx: TypeContext): readonly TypeField[] => {
  const here = deref(node, ctx)
  const props = here === null ? null : here["properties"]
  if (!isRecord(props)) return []
  const required = new Set(requiredOf(here ?? {}))
  return Object.entries(props).map(([name, raw]): TypeField => {
    const field = isRecord(raw) ? raw : null
    return {
      name,
      schema: field,
      required: required.has(name),
      nullable: field !== null && typeList(field).includes("null"),
      description: field === null ? "" : textAt(field, ["description"]),
    }
  })
}

export const structureOf = (node: SchemaNode | null, ctx: TypeContext): Structure => {
  const here = deref(node, ctx)
  if (here === null) return { shape: "none" }
  if (Array.isArray(here["enum"])) return { shape: "values", values: enumOf(here), node: here }
  if (isRecord(here["properties"])) return { shape: "fields", node: here }
  const items = itemsOf(here)
  if (items === null) return { shape: "none" }
  return structureOf(items, ctx)
}

const ownDescriptions = (here: SchemaNode | null, ctx: TypeContext): Readonly<Record<string, string>> => {
  if (ctx.entry === null || here === null) return {}
  return here === ctx.entry.schema ? ctx.entry.valueDescriptions : {}
}

export const valueDescriptionsOf = (node: SchemaNode | null, ctx: TypeContext): Readonly<Record<string, string>> => {
  const here = deref(node, ctx)
  const named = namedOf(node, ctx.registry)
  return {
    ...stringMap(here?.["x-enumDescriptions"]),
    ...ownDescriptions(here, ctx),
    ...(ctx.registry[named]?.valueDescriptions ?? {}),
  }
}

export const formatOf = (node: SchemaNode | null): string => {
  const format = node?.["format"]
  return typeof format === "string" ? format : ""
}

export const describeOf = (node: SchemaNode | null): string => {
  const description = node?.["description"]
  return typeof description === "string" ? description : ""
}

const segmentsOf = (expr: string): readonly string[] =>
  expr
    .split(".")
    .map((segment) => segment.replace(ARRAY_SUFFIX, "").trim())
    .filter((segment) => segment !== "")

const propertyOf = (node: SchemaNode | null, name: string): SchemaNode | null => {
  const props = node === null ? null : node["properties"]
  if (!isRecord(props)) return null
  const field = props[name]
  return isRecord(field) ? field : null
}

const stepSchema = (node: SchemaNode | null, name: string, ctx: TypeContext): SchemaNode | null => {
  const here = deref(node, ctx)
  if (here === null) return null
  const direct = propertyOf(here, name)
  if (direct !== null) return direct
  return propertyOf(deref(itemsOf(here), ctx), name)
}

export const resolveType = (registry: TypeRegistry, expr: string): TypeLink => {
  const segments = segmentsOf(expr)
  const root = segments[0] ?? ""
  const path = segments.slice(1)
  const entry = registry[root] ?? null
  const context = contextOf(registry, entry)
  const schema = path.reduce<SchemaNode | null>((node, name) => stepSchema(node, name, context), entry?.schema ?? null)
  return { expr, root, path, entry, schema, context }
}

const kindByShape: Record<Structure["shape"], string> = {
  values: "enum",
  fields: "record",
  none: "value",
}

export const kindOf = (link: TypeLink): string => {
  if (link.entry !== null && link.entry.kind !== "") return link.entry.kind
  if (link.schema === null) return ""
  if (typeList(link.schema).includes("array")) return "list"
  return kindByShape[structureOf(link.schema, link.context).shape]
}

export const hasSchema = (link: TypeLink): boolean => link.schema !== null
