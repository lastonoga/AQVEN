import type { CallColumn, CheckCell, CheckResult, Comparison, ScoreFact } from "@/domain"
import { checkSpan, joinSpans, scoreTone, type CellBlock, type Inline, type Span, type TagSpec, type Tone } from "@/components/studio"
import { PAIR_SEPARATOR, score, signed } from "@/lib/format"
import type { Translator } from "@/i18n/translator"
import { inlineBlock, LINK_TONE, linkBlock } from "./blocks"
import type { TraceContext } from "./context"

type CheckPart = (check: CheckCell, ctx: TraceContext) => readonly CellBlock[]

const deltaTone = (stopped: boolean, delta: number): Tone => {
  if (stopped) return "loop"
  return delta < 0 ? "destructive" : "success"
}

const deltaTrail = (fact: ScoreFact, previous: number, t: Translator): readonly Span[] => {
  const stopped = fact.stopped === true
  const delta = fact.value - previous
  const tone = deltaTone(stopped, delta)
  const stop: readonly Span[] = stopped ? [{ text: ` ${t("domain.check.stop")}`, tone }] : []
  return [{ text: signed(delta), tone }, ...stop]
}

const meterTrail = (fact: ScoreFact, t: Translator): Pick<CellBlock<"meter">, "trail"> => {
  if (fact.judges !== undefined) return { trail: { text: fact.judges.map(score).join(PAIR_SEPARATOR), tone: "neutral" } }
  if (fact.previous !== undefined) return { trail: deltaTrail(fact, fact.previous, t) }
  return {}
}

const meterPart: CheckPart = (check, ctx) => {
  const fact = check.score
  if (fact === undefined) return []
  const bar = { value: fact.value, tone: scoreTone(fact.value, fact.stopped === true) }
  return [{ kind: "meter", value: score(fact.value), bar, ...meterTrail(fact, ctx.t) }]
}

const checkLine = (pass: boolean, text: string): CellBlock => inlineBlock([[checkSpan(pass, text)]], "small")

const thresholdPart: CheckPart = (check, ctx) => {
  const fact = check.score
  if (fact?.threshold === undefined || fact.expectedDelta !== undefined) return []
  const threshold = score(fact.threshold)
  const pass = fact.value >= fact.threshold
  const text = pass ? ctx.t("domain.check.aboveThreshold", { threshold }) : ctx.t("domain.check.belowThreshold", { threshold })
  return [checkLine(pass, text)]
}

const expectedPart: CheckPart = (check, ctx) => {
  const delta = check.score?.expectedDelta
  if (delta === undefined) return []
  return [checkLine(true, ctx.t("domain.check.expectedMatched", { delta: score(delta) }))]
}

const quoted = (value: string | null, t: Translator): string => (value === null ? t("common.none") : t("common.quoted", { text: value }))

const findingTag = (comparison: Comparison, t: Translator): TagSpec => {
  const finding = comparison.finding
  if (finding.kind === "close") return { tone: "success", children: t("domain.check.close", { delta: score(finding.delta) }) }
  return { tone: "destructive", children: finding.message }
}

const checkLines = (checks: readonly CheckResult[]): readonly CellBlock[] =>
  checks.length === 0 ? [] : [inlineBlock(checks.map((item): Inline => [checkSpan(item.pass, item.name)]), "small")]

const comparisonPart: CheckPart = (check, ctx) => {
  const comparison = check.comparison
  if (comparison === undefined) return []
  const lines: readonly Inline[] = [
    ctx.t("trace.postCheck.actual", { value: quoted(comparison.actual, ctx.t) }),
    { text: ctx.t("trace.postCheck.expected", { value: quoted(comparison.expected, ctx.t) }), tone: "neutral" },
  ]
  const checks = check.checks ?? []
  const divider: readonly CellBlock[] = checks.length > 0 || check.ratio !== undefined ? [{ kind: "divider" }] : []
  return [inlineBlock(lines, "small", "default"), { kind: "tags", tags: [findingTag(comparison, ctx.t)] }, ...divider, ...checkLines(checks)]
}

const ratioPart: CheckPart = (check, ctx) => {
  const ratio = check.ratio
  if (ratio === undefined) return []
  return [checkLine(ratio.passed === ratio.total, ctx.t("domain.check.assertionsPassed", { passed: ratio.passed, total: ratio.total }))]
}

const checksPart: CheckPart = (check) => {
  if (check.comparison !== undefined || check.checks === undefined || check.checks.length === 0) return []
  return [inlineBlock([joinSpans(check.checks.map((item) => checkSpan(item.pass, item.name)))], "small")]
}

const noteTone = (pass: boolean | undefined): Tone => {
  if (pass === undefined) return "neutral"
  return pass ? "success" : "destructive"
}

const notePart: CheckPart = (check) => {
  const note = check.note
  if (note === undefined) return []
  return [inlineBlock([{ text: note.text, tone: noteTone(note.pass) }], "caption")]
}

const judgeLinkPart: CheckPart = (check, ctx) => {
  if (ctx.variant !== "trace" || check.judgeCount === undefined) return []
  return [linkBlock(ctx.t("trace.postCheck.judgeVerdicts", { count: check.judgeCount }), LINK_TONE.trace)]
}

const CHECK_PARTS: readonly CheckPart[] = [meterPart, thresholdPart, expectedPart, comparisonPart, ratioPart, checksPart, notePart, judgeLinkPart]

export const checkCells = (column: CallColumn, ctx: TraceContext): readonly CellBlock[] => {
  const check = column.check
  if (check === undefined) return []
  return CHECK_PARTS.flatMap((part) => part(check, ctx))
}
