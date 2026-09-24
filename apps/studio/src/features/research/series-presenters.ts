import { assertNever, type AttemptOutcome, type CheckId, type CheckSource, type ExperimentCheck, type SeriesAttempt, type SeriesCaseFilter, type SeriesCaseRow, type SeriesDetail, type SeriesSpend, type SeriesStatus, type SeriesSummary, type VariantId, type VariantTally } from "@/domain"
import type { Tone } from "@/components/studio"

export type VerdictGap = "look" | "pending" | "failed" | "none"

export type CaseFilterKey = keyof SeriesCaseFilter

export const CASE_FILTER_KEYS: readonly CaseFilterKey[] = ["failures", "divergent"]

const SPEND_WARNING_SHARE = 0.8

const PENDING_STATUSES: ReadonlySet<SeriesStatus> = new Set<SeriesStatus>(["running", "awaiting_approval", "waiting_human"])

export const shareOf = (part: number, whole: number): number => (whole <= 0 ? 0 : Math.min(1, Math.max(0, part / whole)))

export const spendTone = (series: Pick<SeriesDetail, "spend">): Tone => {
  const share = shareOf(series.spend.usd, series.spend.capUsd)
  if (share >= 1) return "destructive"
  if (share >= SPEND_WARNING_SHARE) return "warning"
  return "neutral"
}

export type UnpricedSpend = { readonly attempts: number; readonly series: number }

export const isLowerBound = (spend: Pick<SeriesSpend, "unpricedAttempts">): boolean => spend.unpricedAttempts > 0

export const unpricedSpend = (series: readonly Pick<SeriesSummary, "spend">[]): UnpricedSpend => {
  const bounded = series.filter((item) => isLowerBound(item.spend))
  return { attempts: bounded.reduce((total, item) => total + item.spend.unpricedAttempts, 0), series: bounded.length }
}

export const verdictGap = (series: Pick<SeriesDetail, "question" | "status">): VerdictGap => {
  if (series.question.kind === "look") return "look"
  if (PENDING_STATUSES.has(series.status)) return "pending"
  if (series.status === "failed") return "failed"
  return "none"
}

export const tallyTone = (tally: Pick<VariantTally, "passed" | "total">): Tone => {
  if (tally.total === 0) return "neutral"
  if (tally.passed === tally.total) return "success"
  if (tally.passed === 0) return "destructive"
  return "warning"
}

export const failedChecksOf = (row: Pick<SeriesCaseRow, "variants">): readonly CheckId[] => [...new Set(row.variants.flatMap((tally) => tally.failedChecks))]

export const tallyOf = (row: Pick<SeriesCaseRow, "variants">, variant: VariantId): VariantTally | null =>
  row.variants.find((tally) => tally.variant === variant) ?? null

const PENDING_OUTCOMES: ReadonlySet<AttemptOutcome> = new Set<AttemptOutcome>(["waiting", "running"])

export const isPending = (outcome: AttemptOutcome): boolean => PENDING_OUTCOMES.has(outcome)

export const pendingOf = (row: Pick<SeriesCaseRow, "attempts">, variant: VariantId, outcome: AttemptOutcome): number =>
  row.attempts.filter((attempt) => attempt.variant === variant && attempt.outcome === outcome).length

export const hasErrors = (attempts: readonly Pick<SeriesAttempt, "error">[]): boolean => attempts.some((attempt) => attempt.error !== null)

export const hasFinished = (row: Pick<SeriesCaseRow, "variants">): boolean => row.variants.some((tally) => tally.total > 0)

export const orderedAttempts = (attempts: readonly SeriesAttempt[], variants: readonly VariantId[]): readonly SeriesAttempt[] =>
  [...attempts].sort((left, right) => variants.indexOf(left.variant) - variants.indexOf(right.variant) || left.repeat - right.repeat)

export const toggledFilter = (filter: SeriesCaseFilter, key: CaseFilterKey): SeriesCaseFilter => {
  const on = (candidate: CaseFilterKey): boolean => (candidate === key ? filter[candidate] !== true : filter[candidate] === true)
  return { ...(on("failures") ? { failures: true } : {}), ...(on("divergent") ? { divergent: true } : {}) }
}

export const hasFilter = (filter: SeriesCaseFilter): boolean => CASE_FILTER_KEYS.some((key) => filter[key] === true)

export type CheckHintCopy = {
  readonly builtin: (use: string) => string
  readonly fields: (fields: string) => string
  readonly code: (ref: string) => string
  readonly judge: (inference: string) => string
  readonly agent: (agent: string) => string
  readonly validatedBy: (experiment: string) => string
  readonly notValidated: string
}

const HINT_JOIN = " · "
const FIELD_JOIN = ", "

const hintParts = (source: CheckSource, copy: CheckHintCopy): readonly (string | null)[] => {
  if (source.kind === "code") return [copy.code(source.ref)]
  if (source.kind === "builtin") return [copy.builtin(source.use), source.fields.length === 0 ? null : copy.fields(source.fields.join(FIELD_JOIN))]
  if (source.kind === "judge") {
    return [
      copy.judge(source.inference),
      source.agent === null ? null : copy.agent(source.agent.id),
      source.validatedBy === null ? copy.notValidated : copy.validatedBy(source.validatedBy),
    ]
  }
  return assertNever(source)
}

export const checkHint = (checks: readonly ExperimentCheck[], id: CheckId, copy: CheckHintCopy): string | null => {
  const check = checks.find((item) => item.id === id)
  if (check === undefined) return null
  return hintParts(check.source, copy)
    .filter((part) => part !== null)
    .join(HINT_JOIN)
}
