import type {
  CaseTags,
  CompareQuestion,
  EstimateReason,
  ExperimentDetail,
  ExperimentFilter,
  ExperimentQuestion,
  ExperimentSubject,
  ExperimentSummary,
  Guardrail,
  LatestSeries,
  LaunchEstimate,
  LaunchRequest,
  MetricColumn,
  NodeRange,
  NoninferiorQuestion,
  QuestionKind,
  SeriesSplit,
  SeriesStatus,
  SeriesSummary,
  ThresholdBound,
  ThresholdQuestion,
  VariantRole,
  VerdictState,
} from "@/domain"
import { ACTIVE_SERIES_STATUSES } from "@/domain"
import type { DateTimeFormatOptions } from "use-intl"
import type { Tone } from "@/components/studio"
import { joinMeta, runRef, usd } from "@/lib/format"
import { marginText, metricName, metricValue, unitOf, type BuiltinNames } from "./metrics"
import { SERIES_STATUS_TONE, VERDICT_TONE } from "./tones"

export type Badge = { readonly label: string; readonly tone: Tone; readonly detail: string | null }

export type SubjectCopy = {
  readonly flow: (flow: string) => string
  readonly range: (flow: string, range: string) => string
  readonly arm: (arm: string) => string
  readonly armRange: (arm: string, range: string) => string
}

export type ListCopy = {
  readonly subject: SubjectCopy
  readonly verdict: (state: VerdictState) => string
  readonly status: (status: SeriesStatus) => string
  readonly split: (split: SeriesSplit) => string
  readonly series: (count: number) => string
  readonly spent: (amount: string) => string
}

export type ExperimentRow = {
  readonly id: ExperimentSummary["id"]
  readonly description: string
  readonly question: ExperimentSummary["question"]
  readonly subject: string
  readonly variants: string
  readonly latest: Badge | null
  readonly series: string
}

type ThresholdValues = { readonly variant: string; readonly metric: string; readonly bound: ThresholdBound; readonly value: string; readonly margin: string }

type PairValues = { readonly candidate: string; readonly baseline: string; readonly metric: string; readonly margin: string }

export type QuestionCopy = {
  readonly look: () => string
  readonly threshold: (values: ThresholdValues) => string
  readonly thresholdAll: (values: Omit<ThresholdValues, "variant">) => string
  readonly compare: (values: PairValues) => string
  readonly noninferior: (values: PairValues) => string
  readonly guardrail: (values: { readonly metric: string; readonly margin: string }) => string
  readonly builtin: BuiltinNames
}

type ReasonValues = {
  readonly cases: number
  readonly recommended: number
  readonly available: number
  readonly halfWidth: string
  readonly margin: string
}

export type ReasonCopy = { readonly [K in EstimateReason]: (values: ReasonValues) => string }

export type FilterPatch = { readonly [K in keyof ExperimentFilter]?: ExperimentFilter[K] | null }

export type LaunchDraft = { readonly on: SeriesSplit; readonly cases: string; readonly repeats: string }

export type LaunchProblem = "cases" | "repeats"

export type LaunchCheck = { readonly kind: "valid"; readonly request: LaunchRequest } | { readonly kind: "invalid"; readonly problems: readonly LaunchProblem[] }

export const MAX_REPEATS = 20

export const STARTED_FORMAT: DateTimeFormatOptions = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }

const ARROW = " → "
const LIST_SEPARATOR = ", "
const TAG_JOIN = "="
const WHOLE_NUMBER = /^\d+$/
const LAUNCH_FIELDS: readonly LaunchProblem[] = ["cases", "repeats"]

export const rangeText = (range: NodeRange): string => (range.from === range.to ? range.from : `${range.from}${ARROW}${range.to}`)

export const subjectText = (subject: ExperimentSubject, copy: SubjectCopy): string => {
  if (subject.kind === "flow") return copy.flow(subject.flow)
  if (subject.kind === "range") return copy.range(subject.flow, rangeText(subject.range))
  if (subject.range === null) return copy.arm(subject.arm)
  return copy.armRange(subject.arm, rangeText(subject.range))
}

export const variantsText = (summary: Pick<ExperimentSummary, "variants" | "baseline" | "candidate">): string => {
  const { baseline, candidate, variants } = summary
  if (baseline === null || candidate === null) return variants.join(LIST_SEPARATOR)
  const others = variants.filter((variant) => variant !== baseline && variant !== candidate)
  const pair = `${baseline}${ARROW}${candidate}`
  return others.length === 0 ? pair : [pair, ...others].join(LIST_SEPARATOR)
}

export const latestBadge = (latest: LatestSeries | null, copy: Pick<ListCopy, "verdict" | "status" | "split">): Badge | null => {
  if (latest === null) return null
  const detail = copy.split(latest.on)
  if (latest.verdict === null) return { label: copy.status(latest.status), tone: SERIES_STATUS_TONE[latest.status], detail }
  return { label: copy.verdict(latest.verdict), tone: VERDICT_TONE[latest.verdict], detail }
}

export const seriesText = (summary: Pick<ExperimentSummary, "seriesCount" | "spentUsd">, copy: Pick<ListCopy, "series" | "spent">): string =>
  joinMeta([copy.series(summary.seriesCount), summary.spentUsd > 0 ? copy.spent(usd(summary.spentUsd)) : null])

export const experimentRows = (experiments: readonly ExperimentSummary[], copy: ListCopy): readonly ExperimentRow[] =>
  experiments.map((experiment) => ({
    id: experiment.id,
    description: experiment.description,
    question: experiment.question,
    subject: subjectText(experiment.subject, copy.subject),
    variants: variantsText(experiment),
    latest: latestBadge(experiment.latest, copy),
    series: seriesText(experiment, copy),
  }))

const patched = <T>(current: T | undefined, next: T | null | undefined): T | null => {
  if (next === undefined) return current ?? null
  return next
}

export const withFilter = (filter: ExperimentFilter, patch: FilterPatch): ExperimentFilter => {
  const flow = patched(filter.flow, patch.flow)
  const question = patched(filter.question, patch.question)
  const failureMode = patched(filter.failureMode, patch.failureMode)
  return {
    ...(flow === null ? {} : { flow }),
    ...(question === null ? {} : { question }),
    ...(failureMode === null ? {} : { failureMode }),
  }
}

export const hasNarrowing = (filter: ExperimentFilter): boolean => filter.question !== undefined || filter.failureMode !== undefined

export const failureModes = (experiments: readonly ExperimentSummary[]): readonly string[] =>
  [...new Set(experiments.flatMap((experiment) => (experiment.failureMode === null ? [] : [experiment.failureMode])))].sort()

export const shownRole = (role: VariantRole, question: QuestionKind): VariantRole | null => (question === "look" ? null : role)

export const questionMetrics = (metrics: readonly MetricColumn[]): readonly MetricColumn[] =>
  metrics.filter((column) => column.role === "primary" || column.role === "guardrail")

export const tagPairs = (tags: CaseTags): readonly string[] => Object.entries(tags).map(([key, value]) => `${key}${TAG_JOIN}${value}`)

const thresholdSentence = (question: ThresholdQuestion, metrics: readonly MetricColumn[], copy: QuestionCopy): string => {
  const unit = unitOf(metrics, question.metric)
  const values = {
    metric: metricName(question.metric, copy.builtin),
    bound: question.bound,
    value: metricValue(question.value, unit),
    margin: marginText(question.margin, unit, false),
  }
  if (question.variant === null) return copy.thresholdAll(values)
  return copy.threshold({ ...values, variant: question.variant })
}

const pairSentence = (question: CompareQuestion | NoninferiorQuestion, metrics: readonly MetricColumn[], copy: QuestionCopy): string =>
  copy[question.kind]({
    candidate: question.candidate,
    baseline: question.baseline,
    metric: metricName(question.primary, copy.builtin),
    margin: marginText(question.margin, unitOf(metrics, question.primary), question.relative),
  })

export const questionSentence = (question: ExperimentQuestion, metrics: readonly MetricColumn[], copy: QuestionCopy): string => {
  if (question.kind === "look") return copy.look()
  if (question.kind === "threshold") return thresholdSentence(question, metrics, copy)
  return pairSentence(question, metrics, copy)
}

export const guardrailsOf = (question: ExperimentQuestion): readonly Guardrail[] =>
  question.kind === "compare" || question.kind === "noninferior" ? question.guardrails : []

export const guardrailSentences = (question: ExperimentQuestion, metrics: readonly MetricColumn[], copy: QuestionCopy): readonly string[] =>
  guardrailsOf(question).map((guard) =>
    copy.guardrail({ metric: metricName(guard.metric, copy.builtin), margin: marginText(guard.margin, unitOf(metrics, guard.metric), guard.relative) }),
  )

const primaryColumn = (metrics: readonly MetricColumn[]): MetricColumn | null => metrics.find((column) => column.role === "primary") ?? null

export const launchReason = (estimate: LaunchEstimate, metrics: readonly MetricColumn[], copy: ReasonCopy): string => {
  const primary = primaryColumn(metrics)
  const unit = primary?.unit ?? "score"
  const relative = primary?.relative ?? false
  return copy[estimate.recommended.reason]({
    cases: estimate.request.cases,
    recommended: estimate.recommended.cases,
    available: estimate.available,
    halfWidth: estimate.halfWidth === null ? "" : marginText(estimate.halfWidth, unit, relative),
    margin: estimate.margin === null ? "" : marginText(estimate.margin, unit, relative),
  })
}

const wholeNumber = (text: string, max: number): number | null => {
  const trimmed = text.trim()
  if (!WHOLE_NUMBER.test(trimmed)) return null
  const value = Number(trimmed)
  if (value < 1 || value > max) return null
  return value
}

export const checkLaunch = (draft: LaunchDraft, available: number): LaunchCheck => {
  const parsed: Readonly<Record<LaunchProblem, number | null>> = {
    cases: wholeNumber(draft.cases, available),
    repeats: wholeNumber(draft.repeats, MAX_REPEATS),
  }
  const { cases, repeats } = parsed
  if (cases === null || repeats === null) return { kind: "invalid", problems: LAUNCH_FIELDS.filter((field) => parsed[field] === null) }
  return { kind: "valid", request: { on: draft.on, cases, repeats } }
}

export const shortfallOf = (estimate: LaunchEstimate): "below" | "belowAvailable" | null => {
  if (!estimate.belowRecommended) return null
  return estimate.recommended.cases > estimate.available ? "belowAvailable" : "below"
}

export const availableOn = (experiment: Pick<ExperimentDetail, "cases">, on: SeriesSplit): number => experiment.cases.splits[on]

export const plannedCases = (experiment: Pick<ExperimentDetail, "cases" | "plan">, on: SeriesSplit): number =>
  Math.min(experiment.plan.cases ?? experiment.cases.selected, availableOn(experiment, on))

export const planLaunch = (experiment: Pick<ExperimentDetail, "cases" | "plan">): LaunchRequest => ({
  on: "dev",
  cases: plannedCases(experiment, "dev"),
  repeats: experiment.plan.repeats,
})

export const draftOf = (request: LaunchRequest): LaunchDraft => ({ on: request.on, cases: String(request.cases), repeats: String(request.repeats) })

export const requestKey = (request: LaunchRequest): string => `${request.on}:${String(request.cases)}:${String(request.repeats)}`

export const isActive = (status: SeriesStatus): boolean => ACTIVE_SERIES_STATUSES.some((item) => item === status)

export const activeSeries = (series: readonly SeriesSummary[]): SeriesSummary | null => series.find((item) => isActive(item.status)) ?? null

export const seriesRef = (id: string): string => runRef(id)

export const sizeText = (cases: number, repeats: number): string => `${String(cases)}×${String(repeats)}`
