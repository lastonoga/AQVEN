import type { NodeKind } from "@/domain"
import { NODE_KIND, type Inline, type Span, type Tone } from "@/components/studio"

export type LegendLabels = {
  readonly container: string
  readonly loopBackEdge: string
  readonly dependencies: string
  readonly problems: string
}

const CONTAINER_KINDS: readonly NodeKind[] = ["parallel", "map", "switch", "loop"]

const GAP: Span = { text: " " }

const glyphRow = (glyph: string, tone: Tone, text: string): readonly Span[] => [{ text: glyph, tone }, GAP, { text }]

export const legendRows = (labels: LegendLabels): readonly Inline[] => [
  glyphRow(CONTAINER_KINDS.map((kind) => NODE_KIND[kind].code).join(" "), "neutral", labels.container),
  glyphRow("┄", "loop", labels.loopBackEdge),
  glyphRow("→", "neutral", labels.dependencies),
  glyphRow("●", "destructive", labels.problems),
]
