export type JsonSchema = Record<string, unknown>

export type TypeFacts = {
  name?: string
  kind?: string
  declared?: boolean
  description?: string
  example?: unknown
  schema?: JsonSchema
  valueDescriptions?: Record<string, string>
}

export type TypeCatalog = Record<string, TypeFacts>

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const asSchema = (value: unknown): JsonSchema => (isRecord(value) ? value : {})

export const textAt = (bag: Record<string, unknown>, key: string): string => {
  const value = bag[key]
  return typeof value === "string" ? value : ""
}

export const numberAt = (bag: Record<string, unknown>, key: string): number | null => {
  const value = bag[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export const stringsAt = (bag: Record<string, unknown>, key: string): string[] => {
  const value = bag[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

export const listAt = (bag: Record<string, unknown>, key: string): unknown[] => {
  const value = bag[key]
  return Array.isArray(value) ? value : []
}

export const factsOf = (catalog: TypeCatalog | undefined, name: string): TypeFacts | undefined => catalog?.[name]

export const schemaOfType = (catalog: TypeCatalog | undefined, name: string): JsonSchema | undefined =>
  factsOf(catalog, name)?.schema

export const requiredOfType = (catalog: TypeCatalog | undefined, name: string): string[] =>
  stringsAt(asSchema(schemaOfType(catalog, name)), "required")

export const isDeclared = (catalog: TypeCatalog | undefined, name: string): boolean =>
  factsOf(catalog, name)?.declared === true
