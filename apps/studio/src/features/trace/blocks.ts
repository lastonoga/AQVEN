import type { CellBlock, Inline } from "@/components/studio"

type InlineRole = CellBlock<"inline">["role"]
type InlineTone = NonNullable<CellBlock<"inline">["tone"]>

export const inlineBlock = (lines: readonly Inline[], role: InlineRole, tone?: InlineTone): CellBlock<"inline"> =>
  tone === undefined ? { kind: "inline", lines, role } : { kind: "inline", lines, role, tone }

export const textBlock = (lines: CellBlock<"text">["lines"], variant: CellBlock<"text">["variant"]): CellBlock<"text"> => ({
  kind: "text",
  lines,
  variant,
  clamp: true,
})
