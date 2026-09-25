import { type AttemptOutcome, type CheckId, type CheckSource, type ExperimentCheck, type SeriesAttempt, type SeriesCaseFilter, type SeriesCaseRow, type SeriesDetail, type SeriesSpend, type SeriesStatus, type SeriesSummary, type VariantId, type VariantTally } from "@/domain"
import type { DateTimeFormatOptions } from "use-intl"
import type { Tone } from "@/components/studio"
import { STARTED_FORMAT } from "./presenters"

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

export type PausedSeries = Pick<SeriesSummary, "id" | "status" | "pause" | "spend">

const CAP_GROWTH = 2
const CENT = 0.01
const CENTS_DIGITS = 2

export const isSpendPause = (series: Pick<SeriesSummary, "status" | "pause">): boolean =>
  series.status === "awaiting_approval" && series.pause?.reason === "spend_near_cap"

export const nextCapDraft = (cap: number): string => {
  const next = cap * CAP_GROWTH
  return next >= CENT ? next.toFixed(CENTS_DIGITS) : String(next)
}

export const continuedCap = (draft: string, cap: number): number | null => {
  const text = draft.trim()
  const value = Number(text)
  return text !== "" && Number.isFinite(value) && value > cap ? value : null
}

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
  return [
    copy.judge(source.inference),
    source.agent === null ? null : copy.agent(source.agent.id),
    source.validatedBy === null ? copy.notValidated : copy.validatedBy(source.validatedBy),
  ]
}

export const checkHint = (checks: readonly ExperimentCheck[], id: CheckId, copy: CheckHintCopy): string | null => {
  const check = checks.find((item) => item.id === id)
  if (check === undefined) return null
  return hintParts(check.source, copy)
    .filter((part) => part !== null)
    .join(HINT_JOIN)
}

export type LeftKey = "underMinuteLeft" | "minutesLeft" | "hoursLeft" | "hoursMinutesLeft"

export type TimeLeft = { readonly key: LeftKey; readonly hours: number; readonly minutes: number }

const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const CLOCK_ONLY_BELOW_SECONDS = 12 * 60 * 60
const WHOLE_RATE_FROM = 10

export const FINISH_CLOCK_FORMAT: DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }

const leftKey = (hours: number, minutes: number): LeftKey => {
  if (hours > 0) return minutes === 0 ? "hoursLeft" : "hoursMinutesLeft"
  return minutes === 0 ? "underMinuteLeft" : "minutesLeft"
}

export const timeLeft = (remainingSeconds: number): TimeLeft => {
  const whole = remainingSeconds < SECONDS_PER_MINUTE ? 0 : Math.ceil(remainingSeconds / SECONDS_PER_MINUTE)
  const hours = Math.floor(whole / MINUTES_PER_HOUR)
  const minutes = whole % MINUTES_PER_HOUR
  return { key: leftKey(hours, minutes), hours, minutes }
}

export const finishFormat = (remainingSeconds: number): DateTimeFormatOptions =>
  remainingSeconds < CLOCK_ONLY_BELOW_SECONDS ? FINISH_CLOCK_FORMAT : STARTED_FORMAT

export const rateDigits = (perMinute: number): number => (perMinute < WHOLE_RATE_FROM ? 1 : 0)
