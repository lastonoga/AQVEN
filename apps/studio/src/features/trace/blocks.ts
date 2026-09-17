import type { CellBlock, Inline, TagSpec } from "@/components/studio"
import type { TraceVariant } from "./context"

type InlineRole = CellBlock<"inline">["role"]
type InlineTone = NonNullable<CellBlock<"inline">["tone"]>

export const inlineBlock = (lines: readonly Inline[], role: InlineRole, tone?: InlineTone): CellBlock<"inline"> =>
  tone === undefined ? { kind: "inline", lines, role } : { kind: "inline", lines, role, tone }

export const linkBlock = (text: string, tone: InlineTone): CellBlock<"inline"> => inlineBlock([text], "link", tone)

export const TAG_STYLE: Readonly<Record<TraceVariant, Pick<TagSpec, "fill" | "size">>> = {
  run: { fill: "tint", size: "micro" },
  trace: { fill: "soft", size: "sm" },
}

export const GLYPH_REF_TONE: Readonly<Record<TraceVariant, InlineTone | undefined>> = {
  run: undefined,
  trace: "neutral",
}

export const LINK_TONE: Readonly<Record<TraceVariant, InlineTone>> = {
  run: "llm",
  trace: "default",
}
