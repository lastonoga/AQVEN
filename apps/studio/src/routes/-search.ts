import type { SearchSchemaInput } from "@tanstack/react-router"

export type RawSearch = Readonly<Record<string, unknown>>
export type SearchInput<T> = { readonly [K in keyof T]?: T[K] } & SearchSchemaInput

export const searchValidator =
  <T>(parse: (raw: RawSearch) => T) =>
  (raw: SearchInput<T>): T =>
    parse(raw)

export const optional = <const K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> => {
  const entry: Partial<Record<K, V>> = {}
  if (value === undefined) return entry
  entry[key] = value
  return entry
}
