export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const stringAt = (source: Record<string, unknown>, key: string): string => {
  const value = source[key]
  return typeof value === "string" ? value : ""
}
