import type { AttemptOutcome, CheckId, SeriesAttempt, SeriesCaseFilter, SeriesCaseRow, SeriesDetail, SeriesStatus, VariantId, VariantTally } from "@/domain"
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
