import type { Provenance } from "@/domain"
import { GATEWAY, PROVENANCE, type Inline, type Span, type Tone } from "@/components/studio"
import { joinMeta } from "@/lib/format"
import { STEP_MARKER } from "./markers"

export type LegendLabels = {
  readonly allBranches: string
  readonly oneBranch: string
  readonly loopBackEdge: string
  readonly map: string
  readonly provenance: (kind: Provenance) => string
}

const DIAMOND = "◆"
const DASHED_LINE = "┄"
const SPACE = " "
const GAP: Span = { text: SPACE }

const glyphRow = (glyph: string, tone: Tone, text: string): readonly Span[] => [{ text: glyph, tone }, GAP, { text }]

const provenanceRow = (kinds: readonly Provenance[], labels: LegendLabels["provenance"]): string =>
  kinds.map((kind) => [PROVENANCE[kind].glyph, labels(kind)].join(SPACE)).join(SPACE)

export const legendRows = (labels: LegendLabels): readonly Inline[] => [
  glyphRow(`${DIAMOND} ${GATEWAY.all.glyph}`, GATEWAY.all.tone, labels.allBranches),
  glyphRow(`${DIAMOND} ${GATEWAY.one.glyph}`, GATEWAY.one.tone, labels.oneBranch),
  glyphRow(`${STEP_MARKER.loop.glyph} ${DASHED_LINE}`, STEP_MARKER.loop.tone, labels.loopBackEdge),
  joinMeta([STEP_MARKER["map-n"].glyph, labels.map]),
  provenanceRow(["static", "data", "knowledge"], labels.provenance),
  provenanceRow(["generated", "human"], labels.provenance),
]
