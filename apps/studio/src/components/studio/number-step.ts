export type StepBounds = { readonly atMin: boolean; readonly atMax: boolean }

const wholeOf = (text: string): number | null => {
  const value = Number.parseInt(text, 10)
  return Number.isNaN(value) ? null : value
}

export const stepNumber = (text: string, delta: number, min: number, max: number): string => {
  const value = wholeOf(text)
  if (value === null) return String(min)
  return String(Math.min(max, Math.max(min, value + delta)))
}

export const stepBounds = (text: string, min: number, max: number): StepBounds => {
  const value = wholeOf(text)
  return { atMin: value !== null && value <= min, atMax: value !== null && value >= max }
}
