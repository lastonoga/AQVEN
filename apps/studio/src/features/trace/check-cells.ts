import { checkSpan, type CellBlock, type Inline } from "@/components/studio"
import { inlineBlock } from "./blocks"
import type { TraceContext } from "./context"
import type { CheckCell } from "./model"

type CheckPart = (check: CheckCell, ctx: TraceContext) => readonly CellBlock[]

const NO_BLOCKS: readonly CellBlock[] = []

const findingsPart: CheckPart = (check) => {
  if (check.findings.length === 0) return NO_BLOCKS
  const lines: readonly Inline[] = check.findings.map((finding) => [checkSpan(finding.pass, finding.name)])
  return [inlineBlock(lines, "small")]
}

const notesPart: CheckPart = (check) => {
  const notes = check.findings.map((finding) => finding.note).filter((note): note is string => note !== null)
  if (notes.length === 0) return NO_BLOCKS
  return [inlineBlock(notes, "tiny", "neutral")]
}

const rulesPart: CheckPart = (check, ctx) => {
  if (check.rules.length === 0) return NO_BLOCKS
  return [inlineBlock([ctx.t("trace.postCheck.rules", { count: check.rules.length })], "tiny", "neutral")]
}

const attemptsPart: CheckPart = (check, ctx) => [
  inlineBlock([ctx.t("trace.postCheck.attempts", { count: check.failedAttempts })], "tiny", "neutral"),
]

const CHECK_PARTS: readonly CheckPart[] = [findingsPart, notesPart, rulesPart, attemptsPart]

export const checkCells = (check: CheckCell | null, ctx: TraceContext): readonly CellBlock[] =>
  check === null ? NO_BLOCKS : CHECK_PARTS.flatMap((part) => part(check, ctx))
