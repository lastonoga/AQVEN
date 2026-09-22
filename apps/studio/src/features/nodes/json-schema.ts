export type JsonObject = Readonly<Record<string, unknown>>

export type SchemaField = {
  readonly name: string
  readonly typeLabel: string
  readonly required: boolean
  readonly description: string
}

const ANY_LABEL = "any"
const OBJECT_LABEL = "object"
const JSON_INDENT = 2

export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isUnknownArray = (value: unknown): value is readonly unknown[] => Array.isArray(value)

const textOf = (value: unknown): string | null => (typeof value === "string" ? value : null)

const refName = (value: unknown): string | null => {
  const ref = textOf(value)
  if (ref === null) return null
  return ref.slice(ref.lastIndexOf("/") + 1)
}

const isNullSchema = (value: unknown): boolean => isJsonObject(value) && value["type"] === "null"

const unionLabel = (options: readonly unknown[]): string => `union(${String(options.length)})`

const anyOfLabel = (options: readonly unknown[]): string => {
  const present = options.filter((option) => !isNullSchema(option))
  const nullable = present.length < options.length ? "?" : ""
  if (present.length !== 1) return unionLabel(present)
  return `${schemaTypeLabel(present[0])}${nullable}`
}

export const schemaTypeLabel = (value: unknown): string => {
  if (!isJsonObject(value)) return ANY_LABEL
  const ref = refName(value["$ref"])
  if (ref !== null) return ref
  const anyOf = value["anyOf"]
  if (isUnknownArray(anyOf)) return anyOfLabel(anyOf)
  const oneOf = value["oneOf"]
  if (isUnknownArray(oneOf)) return unionLabel(oneOf)
  const choices = value["enum"]
  if (isUnknownArray(choices)) return `enum(${String(choices.length)})`
  const constant = textOf(value["const"])
  if (constant !== null) return constant
  if (value["type"] === "array") return `${schemaTypeLabel(value["items"])}[]`
  return textOf(value["type"]) ?? OBJECT_LABEL
}

const propertiesOf = (schema: unknown): JsonObject | null => {
  if (!isJsonObject(schema)) return null
  const properties = schema["properties"]
  return isJsonObject(properties) ? properties : null
}

const requiredNames = (schema: unknown): ReadonlySet<string> => {
  if (!isJsonObject(schema)) return new Set()
  const required = schema["required"]
  if (!isUnknownArray(required)) return new Set()
  return new Set(required.filter((name): name is string => typeof name === "string"))
}

const descriptionOf = (field: unknown): string => {
  if (!isJsonObject(field)) return ""
  return textOf(field["description"]) ?? ""
}

export const schemaFields = (schema: unknown): readonly SchemaField[] => {
  const properties = propertiesOf(schema)
  if (properties === null) return []
  const required = requiredNames(schema)
  return Object.entries(properties).map(([name, field]) => ({
    name,
    typeLabel: schemaTypeLabel(field),
    required: required.has(name),
    description: descriptionOf(field),
  }))
}

export const jsonText = (value: unknown): string => JSON.stringify(value, null, JSON_INDENT)
