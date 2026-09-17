import type { ColumnPath } from "@/domain"
import { columnPath } from "@/data/ids"

const FLAG: Readonly<Record<string, boolean>> = { true: true, false: false }

const toText = (raw: unknown): string | undefined => {
  if (typeof raw === "string") return raw
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw)
  return undefined
}

export const parseEnum =
  <const T extends string>(values: readonly T[]) =>
  (raw: unknown): T | undefined =>
    values.find((value) => value === raw)

export const parseId =
  <T extends string>(make: (raw: string) => T) =>
  (raw: unknown): T | undefined => {
    const text = toText(raw)
    if (text === undefined || text.length === 0) return undefined
    return make(text)
  }

export const parsePositiveInt = (raw: unknown): number | undefined => {
  const value = typeof raw === "string" ? Number(raw) : raw
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return undefined
  return value
}

export const parseFlag = (raw: unknown): boolean | undefined => {
  if (typeof raw === "boolean") return raw
  if (typeof raw !== "string") return undefined
  return FLAG[raw]
}

export const parsePaths = (raw: unknown): readonly ColumnPath[] | undefined => {
  if (!Array.isArray(raw)) return undefined
  const texts: readonly unknown[] = raw
  if (!texts.every((item): item is string => typeof item === "string" && item.length > 0)) return undefined
  return texts.map(columnPath)
}
