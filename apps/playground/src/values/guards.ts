export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const recordOf = (value: unknown): Readonly<Record<string, unknown>> => (isRecord(value) ? value : {})

export const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [])

export const isBlank = (value: unknown): boolean => {
  if (value === undefined || value === null || value === "") return true
  if (Array.isArray(value)) return value.length === 0
  return isRecord(value) && Object.keys(value).length === 0
}
