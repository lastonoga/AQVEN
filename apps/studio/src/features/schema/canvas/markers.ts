import type { StepMarker } from "@/domain"
import type { Tone } from "@/components/studio"

export type StepMarkerSpec = { readonly glyph: string; readonly tone: Tone }

export const STEP_MARKER: Readonly<Record<StepMarker, StepMarkerSpec>> = {
  "map-n": { glyph: "×N", tone: "tool" },
  "map-fanout": { glyph: "▮▮▮", tone: "tool" },
  loop: { glyph: "⟳", tone: "loop" },
  image: { glyph: "▦", tone: "llm" },
  audio: { glyph: "◍", tone: "tool" },
  video: { glyph: "▶", tone: "warning" },
}
