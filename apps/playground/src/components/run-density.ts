import type { SignalKind } from "./run-table.js"

export type Density = "tight" | "normal" | "full"

export const DENSITIES: readonly Density[] = ["tight", "normal", "full"]

export const DENSITY_LABELS: Readonly<Record<Density, string>> = {
  tight: "плотно",
  normal: "обычно",
  full: "полно",
}

export const DENSITY_LINES: Readonly<Record<Density, number>> = { tight: 0, normal: 4, full: 24 }

const ALWAYS_OPEN: ReadonlySet<SignalKind> = new Set<SignalKind>(["error", "check"])

export const linesFor = (density: Density, signal: SignalKind | null): number => {
  if (signal !== null && ALWAYS_OPEN.has(signal)) return Math.max(DENSITY_LINES[density], DENSITY_LINES.full)
  return DENSITY_LINES[density]
}

const KEY = "wf.run.density"

export const readDensity = (): Density => {
  const stored = globalThis.localStorage?.getItem(KEY)
  return DENSITIES.find((density) => density === stored) ?? "normal"
}

export const writeDensity = (density: Density): void => {
  globalThis.localStorage?.setItem(KEY, density)
}
