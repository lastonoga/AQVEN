import type { CanvasEdge } from "../layout"

export const FLOW_PALETTE: readonly string[] = ["var(--flow-1)", "var(--flow-2)", "var(--flow-3)", "var(--flow-4)", "var(--flow-5)"]

const paletteAt = (index: number): string => FLOW_PALETTE[index % FLOW_PALETTE.length] ?? "var(--flow-1)"

export const colorsBySource = (edges: readonly CanvasEdge[]): ReadonlyMap<string, string> => {
  const colors = new Map<string, string>()
  let assigned = 0
  edges.forEach((edge) => {
    if (edge.variant !== "flow" || colors.has(edge.source)) return
    colors.set(edge.source, paletteAt(assigned))
    assigned += 1
  })
  return colors
}

export const colorOf = (colors: ReadonlyMap<string, string>, edge: CanvasEdge): string =>
  edge.variant === "back" ? "var(--loop)" : (colors.get(edge.source) ?? paletteAt(0))

export const DEFAULT_FLOW_COLOR = paletteAt(0)

export const edgeColors = (edges: readonly CanvasEdge[]): ReadonlyMap<string, string> => {
  const bySource = colorsBySource(edges)
  const colors = new Map<string, string>()
  edges.forEach((edge) => colors.set(edge.id, colorOf(bySource, edge)))
  return colors
}
