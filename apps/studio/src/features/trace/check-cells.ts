import { checkSpan, type CellBlock, type Inline, type Span } from "@/components/studio"
import { inlineBlock } from "./blocks"
import type { TraceContext } from "./context"
import type { CheckCell, CheckFinding } from "./model"

type CheckPart = (check: CheckCell, ctx: TraceContext) => readonly CellBlock[]

export type FindingGroup = {
  readonly finding: CheckFinding
  readonly count: number
  readonly attempts: number
}

type GroupDraft = { readonly finding: CheckFinding; count: number; readonly attempts: Set<number> }

const NO_BLOCKS: readonly CellBlock[] = []

const findingKey = (finding: CheckFinding): string => JSON.stringify([finding.name, finding.pass, finding.note])

export const groupFindings = (findings: readonly CheckFinding[]): readonly FindingGroup[] => {
  const drafts = new Map<string, GroupDraft>()
  findings.forEach((finding) => {
    const key = findingKey(finding)
    const draft = drafts.get(key) ?? { finding, count: 0, attempts: new Set<number>() }
    draft.count += 1
    draft.attempts.add(finding.attempt)
    drafts.set(key, draft)
  })
  return [...drafts.values()].map((draft) => ({ finding: draft.finding, count: draft.count, attempts: draft.attempts.size }))
}

const repeatSpans = (group: FindingGroup, ctx: TraceContext): readonly Span[] =>
  group.count === 1 ? [] : [{ text: ` ${ctx.t("trace.postCheck.repeated", { count: group.count, attempts: group.attempts })}`, tone: "neutral" }]

const findingLine = (group: FindingGroup, ctx: TraceContext): Inline => [checkSpan(group.finding.pass, group.finding.name), ...repeatSpans(group, ctx)]

const findingsPart: CheckPart = (check, ctx) => {
  if (check.findings.length === 0) return NO_BLOCKS
  return [inlineBlock(groupFindings(check.findings).map((group) => findingLine(group, ctx)), "small")]
}

const notesPart: CheckPart = (check) => {
  const notes = new Set(check.findings.map((finding) => finding.note).filter((note): note is string => note !== null))
  if (notes.size === 0) return NO_BLOCKS
  return [inlineBlock([...notes], "tiny", "neutral")]
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
