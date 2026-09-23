import type {
  AttemptOutcome,
  BuiltinMetric,
  CellVerdict,
  CheckId,
  ExperimentCheck,
  ExperimentQuestion,
  FlowId,
  Guardrail,
  IsoDateTime,
  MatrixRow,
  MetricCell,
  MetricColumn,
  MetricDirection,
  MetricId,
  MetricUnit,
  RunId,
  SeriesAttempt,
  SeriesCaseFilter,
  SeriesCaseRow,
  SeriesDetail,
  SeriesId,
  SeriesOrigin,
  SeriesSplit,
  SeriesStatus,
  SeriesSummary,
  SeriesVerdict,
  StabilityClass,
  StabilityRow,
  ThresholdBound,
  VariantId,
  VariantRole,
  VariantTally,
  VerdictReason,
  VerdictState,
} from "@/domain"
import { BUILTIN_METRICS, isBuiltinMetric } from "@/domain"
import * as ids from "@/data/ids"
import type { DatasetFixture, VariantModel } from "./research-catalog"
import {
  clamp,
  combinedHalfWidth,
  effectiveSize,
  mean,
  meanInterval,
  medianInterval,
  percentile,
  roundTo,
  sum,
  tailInterval,
  unitOf,
  uuidOf,
  wilson,
  type Interval,
} from "./research-math"

export type SeriesFixture = {
  readonly key: string
  readonly origin: SeriesOrigin
  readonly flow: FlowId | null
  readonly on: SeriesSplit
  readonly caseNames: readonly string[]
  readonly repeats: number
  readonly status: SeriesStatus
  readonly done: number | null
  readonly startedAt: IsoDateTime
  readonly finishedAt: IsoDateTime | null
  readonly models: Readonly<Record<string, VariantModel>>
  readonly waiting: Readonly<Record<string, RunId>>
}

export type SeriesVariant = { readonly id: VariantId; readonly role: VariantRole }

export type SeriesContext = {
  readonly question: ExperimentQuestion
  readonly checks: readonly ExperimentCheck[]
  readonly variants: readonly SeriesVariant[]
  readonly dataset: DatasetFixture
  readonly judgeValidated: boolean
}

type PlannedAttempt = { readonly caseName: string; readonly repeat: number; readonly variant: VariantId }

type AttemptRecord = SeriesAttempt & {
  readonly caseName: string
  readonly finished: boolean
  readonly binary: Readonly<Record<string, boolean>>
  readonly scores: Readonly<Record<string, number>>
  readonly schemaValid: boolean
}

type Measure = { readonly value: number | null; readonly interval: Interval | null }

type Advantage = { readonly value: number; readonly low: number; readonly high: number }

type Outcome = "pass" | "fail" | "unclear"

type MetricShape = { readonly unit: MetricUnit; readonly direction: MetricDirection }

const ICC = 0.3
const PAIRING = 0.75
const CASE_SPREAD = 0.5
const SCORE_CASE_WEIGHT = 0.35
const SCORE_NOISE = 0.1
const ERROR_COST_SHARE = 0.3
const COST_JITTER = 0.4
const LATENCY_FLOOR = 0.7
const LATENCY_JITTER = 0.8
const LATENCY_TAIL_SHARE = 0.94
const LATENCY_TAIL_FACTOR = 1.9
const CAP_FACTOR = 1.25
const P95_MIN_ATTEMPTS = 20
const MEDIAN = 0.5
const TAIL = 0.95
const PERCENT = 100
const MINUS = "−"
const EMPTY_MEASURE: Measure = { value: null, interval: null }

const BUILTIN_SHAPE: Readonly<Record<BuiltinMetric, MetricShape>> = {
  success_rate: { unit: "rate", direction: "higher_is_better" },
  cost_usd: { unit: "usd", direction: "lower_is_better" },
  cost_of_pass: { unit: "usd", direction: "lower_is_better" },
  latency_p50_ms: { unit: "ms", direction: "lower_is_better" },
  latency_p95_ms: { unit: "ms", direction: "lower_is_better" },
  schema_valid_first_try: { unit: "rate", direction: "higher_is_better" },
  infra_error_rate: { unit: "rate", direction: "lower_is_better" },
}

const CHECK_UNIT: Readonly<Record<ExperimentCheck["kind"], MetricUnit>> = { binary: "rate", continuous: "score", ordinal: "ordinal" }

const shapeOf = (metric: MetricId, checks: readonly ExperimentCheck[]): MetricShape => {
  if (isBuiltinMetric(metric)) return BUILTIN_SHAPE[metric]
  const check = checks.find((item) => item.id === metric)
  return { unit: check === undefined ? "score" : CHECK_UNIT[check.kind], direction: "higher_is_better" }
}

const column = (
  metric: MetricId,
  role: MetricColumn["role"],
  checks: readonly ExperimentCheck[],
  rule: { readonly direction?: MetricDirection; readonly margin: number | null; readonly relative: boolean },
): MetricColumn => {
  const shape = shapeOf(metric, checks)
  return { id: metric, role, unit: shape.unit, direction: rule.direction ?? shape.direction, margin: rule.margin, relative: rule.relative }
}

const primaryColumns = (question: ExperimentQuestion, checks: readonly ExperimentCheck[]): readonly MetricColumn[] => {
  if (question.kind === "look") return []
  if (question.kind === "threshold") {
    const direction: MetricDirection = question.bound === "above" ? "higher_is_better" : "lower_is_better"
    return [column(question.metric, "primary", checks, { direction, margin: question.margin, relative: false })]
  }
  return [column(question.primary, "primary", checks, { direction: question.direction, margin: question.margin, relative: question.relative })]
}

const guardrailsOf = (question: ExperimentQuestion): readonly Guardrail[] =>
  question.kind === "compare" || question.kind === "noninferior" ? question.guardrails : []

export const metricColumns = (question: ExperimentQuestion, checks: readonly ExperimentCheck[]): readonly MetricColumn[] => {
  const lead = [
    ...primaryColumns(question, checks),
    ...guardrailsOf(question).map((guard) => column(guard.metric, "guardrail", checks, guard)),
  ]
  const used = new Set<string>(lead.map((item) => item.id))
  const rest = checks.filter((check) => !used.has(check.id)).map((check) => column(check.id, "check", checks, { margin: null, relative: false }))
  const builtins = BUILTIN_METRICS.filter((metric) => !used.has(metric)).map((metric) => column(metric, "builtin", checks, { margin: null, relative: false }))
  return [...lead, ...rest, ...builtins]
}

export const seriesIdOf = (key: string): SeriesId => ids.seriesId(uuidOf(`series|${key}`))

const plannedAttempts = (fixture: SeriesFixture, context: SeriesContext): readonly PlannedAttempt[] =>
  fixture.caseNames.flatMap((caseName) =>
    Array.from({ length: fixture.repeats }, (_, index) => index + 1).flatMap((repeat) =>
      context.variants.map((variant) => ({ caseName, repeat, variant: variant.id })),
    ),
  )

const draw = (fixture: SeriesFixture, planned: PlannedAttempt, tag: string): number =>
  unitOf(`${fixture.key}|${planned.caseName}|${planned.variant}|${String(planned.repeat)}|${tag}`)

const caseOffset = (fixture: SeriesFixture, caseName: string): number => (unitOf(`${fixture.key}|case|${caseName}`) - MEDIAN) * CASE_SPREAD

const runOf = (fixture: SeriesFixture, planned: PlannedAttempt): RunId =>
  ids.runId(uuidOf(`run|${fixture.key}|${planned.caseName}|${planned.variant}|${String(planned.repeat)}`))

const modelOf = (fixture: SeriesFixture, variant: VariantId): VariantModel => {
  const model = fixture.models[variant]
  if (model === undefined) throw new Error(`No fixture model for variant ${variant}`)
  return model
}

const latencyOf = (fixture: SeriesFixture, planned: PlannedAttempt, model: VariantModel): number => {
  const tail = draw(fixture, planned, "tail") > LATENCY_TAIL_SHARE ? LATENCY_TAIL_FACTOR : 1
  return Math.round(model.latencyMs * (LATENCY_FLOOR + LATENCY_JITTER * draw(fixture, planned, "latency")) * tail)
}

const costOf = (fixture: SeriesFixture, planned: PlannedAttempt, model: VariantModel, share: number): number =>
  roundTo(model.usd * share * (1 - COST_JITTER / 2 + COST_JITTER * draw(fixture, planned, "usd")), 6)

const binaryResults = (fixture: SeriesFixture, planned: PlannedAttempt, model: VariantModel, checks: readonly ExperimentCheck[]): Readonly<Record<string, boolean>> => {
  const offset = caseOffset(fixture, planned.caseName)
  return Object.fromEntries(
    checks
      .filter((check) => check.kind === "binary")
      .map((check) => [check.id, draw(fixture, planned, check.id) < clamp((model.checks[check.id] ?? 1) + offset, 0, 1)]),
  )
}

const scoreResults = (fixture: SeriesFixture, planned: PlannedAttempt, model: VariantModel, checks: readonly ExperimentCheck[]): Readonly<Record<string, number>> => {
  const offset = caseOffset(fixture, planned.caseName) * SCORE_CASE_WEIGHT
  return Object.fromEntries(
    checks
      .filter((check) => check.kind !== "binary")
      .map((check) => [check.id, roundTo(clamp((model.scores[check.id] ?? 0) + offset + (draw(fixture, planned, check.id) - MEDIAN) * SCORE_NOISE, 0, 1), 4)]),
  )
}

const failedOf = (checks: readonly ExperimentCheck[], binary: Readonly<Record<string, boolean>>): readonly CheckId[] =>
  checks.filter((check) => binary[check.id] === false).map((check) => check.id)

const waitingRecord = (fixture: SeriesFixture, planned: PlannedAttempt, run: RunId): AttemptRecord => ({
  run,
  variant: planned.variant,
  repeat: planned.repeat,
  passed: false,
  outcome: "waiting",
  failedChecks: [],
  usd: costOf(fixture, planned, modelOf(fixture, planned.variant), ERROR_COST_SHARE),
  latencyMs: 0,
  caseName: planned.caseName,
  finished: false,
  binary: {},
  scores: {},
  schemaValid: true,
})

const errorRecord = (fixture: SeriesFixture, planned: PlannedAttempt, model: VariantModel): AttemptRecord => ({
  run: runOf(fixture, planned),
  variant: planned.variant,
  repeat: planned.repeat,
  passed: false,
  outcome: "error",
  failedChecks: [],
  usd: costOf(fixture, planned, model, ERROR_COST_SHARE),
  latencyMs: latencyOf(fixture, planned, model),
  caseName: planned.caseName,
  finished: true,
  binary: {},
  scores: {},
  schemaValid: false,
})

const finishedRecord = (fixture: SeriesFixture, planned: PlannedAttempt, checks: readonly ExperimentCheck[]): AttemptRecord => {
  const model = modelOf(fixture, planned.variant)
  if (draw(fixture, planned, "infra") < model.infraError) return errorRecord(fixture, planned, model)
  const binary = binaryResults(fixture, planned, model, checks)
  const failedChecks = failedOf(checks, binary)
  const passed = failedChecks.length === 0
  const outcome: AttemptOutcome = passed ? "passed" : "failed"
  return {
    run: runOf(fixture, planned),
    variant: planned.variant,
    repeat: planned.repeat,
    passed,
    outcome,
    failedChecks,
    usd: costOf(fixture, planned, model, 1),
    latencyMs: latencyOf(fixture, planned, model),
    caseName: planned.caseName,
    finished: true,
    binary,
    scores: scoreResults(fixture, planned, model, checks),
    schemaValid: draw(fixture, planned, "schema") < model.schemaValid,
  }
}

const attemptRecords = (fixture: SeriesFixture, context: SeriesContext): readonly AttemptRecord[] => {
  const planned = plannedAttempts(fixture, context)
  const done = fixture.done ?? planned.length
  return planned.flatMap((attempt, index) => {
    const waiting = fixture.waiting[attempt.caseName]
    if (waiting !== undefined) return [waitingRecord(fixture, attempt, waiting)]
    if (index >= done) return []
    return [finishedRecord(fixture, attempt, context.checks)]
  })
}

const groupByCase = (records: readonly AttemptRecord[]): ReadonlyMap<string, readonly AttemptRecord[]> => {
  const groups = new Map<string, AttemptRecord[]>()
  records.forEach((record) => {
    groups.set(record.caseName, [...(groups.get(record.caseName) ?? []), record])
  })
  return groups
}

const rateMeasure = (records: readonly AttemptRecord[], hit: (record: AttemptRecord) => boolean): Measure => {
  const groups = [...groupByCase(records).values()].filter((group) => group.length > 0)
  if (groups.length === 0) return EMPTY_MEASURE
  const value = mean(groups.map((group) => group.filter(hit).length / group.length))
  const repeats = records.length / groups.length
  return { value: roundTo(value, 4), interval: wilson(value, effectiveSize(groups.length, repeats, ICC)) }
}

const caseMeanMeasure = (records: readonly AttemptRecord[], read: (record: AttemptRecord) => number | undefined): Measure => {
  const means = [...groupByCase(records).values()]
    .map((group) => group.flatMap((record) => read(record) ?? []))
    .filter((values) => values.length > 0)
    .map(mean)
  if (means.length === 0) return EMPTY_MEASURE
  return { value: roundTo(mean(means), 4), interval: meanInterval(means) }
}

const attemptMeanMeasure = (values: readonly number[]): Measure => {
  if (values.length === 0) return EMPTY_MEASURE
  const interval = meanInterval(values)
  return { value: mean(values), interval: { low: Math.max(0, interval.low), high: interval.high } }
}

const clean = (records: readonly AttemptRecord[]): readonly AttemptRecord[] => records.filter((record) => record.outcome !== "error")

const costOfPass = (records: readonly AttemptRecord[]): Measure => {
  const passes = records.filter((record) => record.passed).length
  if (passes === 0) return EMPTY_MEASURE
  const total = sum(records.map((record) => record.usd))
  const share = wilson(passes / records.length, records.length)
  return {
    value: total / passes,
    interval: { low: total / (records.length * Math.max(share.high, Number.EPSILON)), high: total / (records.length * Math.max(share.low, Number.EPSILON)) },
  }
}

const latencyMeasure = (records: readonly AttemptRecord[], share: number, minimum: number): Measure => {
  const values = clean(records).map((record) => record.latencyMs)
  if (values.length === 0 || values.length < minimum) return EMPTY_MEASURE
  const center = Math.round(percentile(values, share))
  const interval = share === MEDIAN ? medianInterval(values, center) : tailInterval(values, center)
  return { value: center, interval }
}

const BUILTIN_MEASURE: Readonly<Record<BuiltinMetric, (records: readonly AttemptRecord[]) => Measure>> = {
  success_rate: (records) => rateMeasure(records, (record) => record.passed),
  cost_usd: (records) => attemptMeanMeasure(records.map((record) => record.usd)),
  cost_of_pass: costOfPass,
  latency_p50_ms: (records) => latencyMeasure(records, MEDIAN, 1),
  latency_p95_ms: (records) => latencyMeasure(records, TAIL, P95_MIN_ATTEMPTS),
  schema_valid_first_try: (records) => rateMeasure(clean(records), (record) => record.schemaValid),
  infra_error_rate: (records) => rateMeasure(records, (record) => record.outcome === "error"),
}

const CHECK_MEASURE: Readonly<Record<ExperimentCheck["kind"], (records: readonly AttemptRecord[], check: CheckId) => Measure>> = {
  binary: (records, check) => rateMeasure(clean(records), (record) => record.binary[check] === true),
  continuous: (records, check) => caseMeanMeasure(clean(records), (record) => record.scores[check]),
  ordinal: (records, check) => caseMeanMeasure(clean(records), (record) => record.scores[check]),
}

const measureOf = (metric: MetricId, records: readonly AttemptRecord[], checks: readonly ExperimentCheck[]): Measure => {
  if (isBuiltinMetric(metric)) return BUILTIN_MEASURE[metric](records)
  const check = checks.find((item) => item.id === metric)
  if (check === undefined) return EMPTY_MEASURE
  return CHECK_MEASURE[check.kind](records, check.id)
}

const halfOf = (measure: Measure): number => (measure.interval === null ? 0 : (measure.interval.high - measure.interval.low) / 2)

const advantageOf = (candidate: Measure, baseline: Measure, direction: MetricDirection, relative: boolean): Advantage | null => {
  if (candidate.value === null || baseline.value === null) return null
  const sign = direction === "higher_is_better" ? 1 : -1
  const raw = sign * (candidate.value - baseline.value)
  const spread = combinedHalfWidth(halfOf(candidate), halfOf(baseline), PAIRING)
  const scale = relative ? Math.max(Math.abs(baseline.value), Number.EPSILON) : 1
  return { value: raw / scale, low: (raw - spread) / scale, high: (raw + spread) / scale }
}

const settle = (clears: boolean, misses: boolean): Outcome => {
  if (clears) return "pass"
  if (misses) return "fail"
  return "unclear"
}

const beyond = (advantage: Advantage, floor: number): Outcome => settle(advantage.low > floor, advantage.high < floor)

const THRESHOLD_TEST: Readonly<Record<ThresholdBound, (interval: Interval, value: number) => Outcome>> = {
  above: ({ low, high }, value) => settle(low > value, high < value),
  below: ({ low, high }, value) => settle(high < value, low > value),
}

const thresholdOutcome = (measure: Measure, bound: ThresholdBound, value: number): Outcome => {
  if (measure.interval === null) return "unclear"
  return THRESHOLD_TEST[bound](measure.interval, value)
}

const OUTCOME_CELL: Readonly<Record<Outcome, CellVerdict>> = { pass: "pass", fail: "fail", unclear: "unclear" }

type VariantMeasures = { readonly variant: SeriesVariant; readonly measures: ReadonlyMap<MetricId, Measure> }

const measuresOf = (variant: SeriesVariant, records: readonly AttemptRecord[], columns: readonly MetricColumn[], checks: readonly ExperimentCheck[]): VariantMeasures => {
  const own = records.filter((record) => record.finished && record.variant === variant.id)
  return { variant, measures: new Map(columns.map((item) => [item.id, measureOf(item.id, own, checks)])) }
}

const measureAt = (row: VariantMeasures | undefined, metric: MetricId): Measure => row?.measures.get(metric) ?? EMPTY_MEASURE

const testedVariants = (question: ExperimentQuestion, variants: readonly SeriesVariant[]): readonly VariantId[] => {
  if (question.kind !== "threshold") return []
  return question.variant === null ? variants.map((item) => item.id) : [question.variant]
}

const pairFloor = (question: ExperimentQuestion, margin: number): number => (question.kind === "compare" ? margin : -margin)

const cellVerdict = (question: ExperimentQuestion, rows: readonly VariantMeasures[], row: VariantMeasures, item: MetricColumn): CellVerdict => {
  const measure = measureAt(row, item.id)
  if (measure.value === null) return "none"
  if (question.kind === "look") return "none"
  if (question.kind === "threshold") {
    if (item.role !== "primary" || !testedVariants(question, rows.map((entry) => entry.variant)).includes(row.variant.id)) return "none"
    return OUTCOME_CELL[thresholdOutcome(measure, question.bound, question.value)]
  }
  const gated = item.role === "primary" || item.role === "guardrail"
  if (!gated) return "none"
  if (row.variant.id === question.baseline) return "reference"
  if (row.variant.id !== question.candidate) return "none"
  const baseline = rows.find((entry) => entry.variant.id === question.baseline)
  const advantage = advantageOf(measure, measureAt(baseline, item.id), item.direction, item.relative)
  if (advantage === null) return "unclear"
  const floor = item.role === "primary" ? pairFloor(question, item.margin ?? 0) : -(item.margin ?? 0)
  return OUTCOME_CELL[beyond(advantage, floor)]
}

const displayValue = (value: number | null, unit: MetricUnit): number | null => {
  if (value === null) return null
  if (unit === "usd") return roundTo(value, 6)
  if (unit === "ms") return Math.round(value)
  return roundTo(value, 4)
}

const cellOf = (question: ExperimentQuestion, rows: readonly VariantMeasures[], row: VariantMeasures, item: MetricColumn): MetricCell => {
  const measure = measureAt(row, item.id)
  return {
    metric: item.id,
    value: displayValue(measure.value, item.unit),
    ciLow: displayValue(measure.interval?.low ?? null, item.unit),
    ciHigh: displayValue(measure.interval?.high ?? null, item.unit),
    verdict: cellVerdict(question, rows, row, item),
  }
}

const UNIT_TEXT: Readonly<Record<MetricUnit, (value: number) => string>> = {
  usd: (value) => `$${value.toFixed(4)}`,
  ms: (value) => `${String(Math.round(value))} ms`,
  rate: (value) => value.toFixed(2),
  score: (value) => value.toFixed(2),
  ordinal: (value) => value.toFixed(1),
}

const NONZERO_DIGIT = /[1-9]/

const negative = (value: number, text: string): boolean => value < 0 && NONZERO_DIGIT.test(text)

const signedText = (value: number, unit: MetricUnit, relative: boolean): string => {
  const text = relative ? `${String(Math.round(Math.abs(value) * PERCENT))}%` : UNIT_TEXT[unit](Math.abs(value))
  return `${negative(value, text) ? MINUS : "+"}${text}`
}

const plainText = (value: number, unit: MetricUnit): string => {
  const text = UNIT_TEXT[unit](Math.abs(value))
  return `${negative(value, text) ? MINUS : ""}${text}`
}

type PrimaryReading = {
  readonly outcome: Outcome
  readonly measurement: string
  readonly margin: number
  readonly halfWidth: number
  readonly unit: MetricUnit
  readonly breached: readonly MetricId[]
  readonly unsettled: readonly MetricId[]
}

const guardOutcomes = (question: ExperimentQuestion, rows: readonly VariantMeasures[], columns: readonly MetricColumn[]): ReadonlyMap<MetricId, CellVerdict> => {
  const candidate = question.kind === "compare" || question.kind === "noninferior" ? rows.find((row) => row.variant.id === question.candidate) : undefined
  if (candidate === undefined) return new Map()
  return new Map(columns.filter((item) => item.role === "guardrail").map((item) => [item.id, cellVerdict(question, rows, candidate, item)]))
}

const thresholdReading = (question: ExperimentQuestion & { readonly kind: "threshold" }, rows: readonly VariantMeasures[], primary: MetricColumn): PrimaryReading | null => {
  const tested = testedVariants(question, rows.map((row) => row.variant))
  const row = rows.find((entry) => tested.includes(entry.variant.id))
  const measure = measureAt(row, primary.id)
  if (row === undefined || measure.value === null || measure.interval === null) return null
  return {
    outcome: thresholdOutcome(measure, question.bound, question.value),
    measurement: `${row.variant.id}: ${question.metric} is ${plainText(measure.value, primary.unit)} (95% CI ${plainText(measure.interval.low, primary.unit)} to ${plainText(measure.interval.high, primary.unit)}) against ${question.bound} ${plainText(question.value, primary.unit)}`,
    margin: question.margin,
    halfWidth: halfOf(measure),
    unit: primary.unit,
    breached: [],
    unsettled: [],
  }
}

const pairReading = (
  question: ExperimentQuestion & { readonly kind: "compare" | "noninferior" },
  rows: readonly VariantMeasures[],
  columns: readonly MetricColumn[],
  primary: MetricColumn,
): PrimaryReading | null => {
  const candidate = rows.find((row) => row.variant.id === question.candidate)
  const baseline = rows.find((row) => row.variant.id === question.baseline)
  const advantage = advantageOf(measureAt(candidate, primary.id), measureAt(baseline, primary.id), primary.direction, primary.relative)
  if (advantage === null) return null
  const guards = guardOutcomes(question, rows, columns)
  const breached = [...guards].filter(([, verdict]) => verdict === "fail").map(([metric]) => metric)
  const unsettled = [...guards].filter(([, verdict]) => verdict === "unclear").map(([metric]) => metric)
  const show = (value: number): string => signedText(value, primary.unit, primary.relative)
  return {
    outcome: beyond(advantage, pairFloor(question, question.margin)),
    measurement: `${question.candidate} vs ${question.baseline} on ${question.primary}: ${show(advantage.value)} (95% CI ${show(advantage.low)} to ${show(advantage.high)})`,
    margin: question.margin,
    halfWidth: (advantage.high - advantage.low) / 2,
    unit: primary.unit,
    breached,
    unsettled,
  }
}

const primaryReading = (question: ExperimentQuestion, rows: readonly VariantMeasures[], columns: readonly MetricColumn[]): PrimaryReading | null => {
  const primary = columns.find((item) => item.role === "primary")
  if (primary === undefined || question.kind === "look") return null
  if (question.kind === "threshold") return thresholdReading(question, rows, primary)
  return pairReading(question, rows, columns, primary)
}

const settledState = (reading: PrimaryReading): { readonly state: VerdictState; readonly reason: VerdictReason | null } => {
  if (reading.outcome === "fail" || reading.breached.length > 0) return { state: "refuted", reason: null }
  if (reading.outcome === "pass" && reading.unsettled.length === 0) return { state: "confirmed", reason: null }
  return { state: "inconclusive", reason: reading.halfWidth > reading.margin ? "below_mde" : "uninformative" }
}

const settledText = (state: VerdictState, reading: PrimaryReading): string => {
  const guards = reading.breached.length > 0 ? `; guardrail broken: ${reading.breached.join(", ")}` : ""
  const unsettled = state === "inconclusive" && reading.unsettled.length > 0 ? `; guardrail unsettled: ${reading.unsettled.join(", ")}` : ""
  const tail: Readonly<Record<VerdictState, string>> = {
    confirmed: `clears the ${plainText(reading.margin, reading.unit)} margin`,
    refuted: `misses the ${plainText(reading.margin, reading.unit)} margin`,
    inconclusive: `too wide to decide at the ${plainText(reading.margin, reading.unit)} margin`,
    invalid: "no finding",
    signal: "a signal, not a finding",
  }
  return `${reading.measurement}: ${tail[state]}${guards}${unsettled}.`
}

const verdictOf = (fixture: SeriesFixture, context: SeriesContext, reading: PrimaryReading | null, records: readonly AttemptRecord[]): SeriesVerdict | null => {
  const finished = records.filter((record) => record.finished)
  const total = plannedAttempts(fixture, context).length
  if (context.question.kind === "look" || finished.length === 0) return null
  if (fixture.status === "cancelled") return { state: "invalid", reason: "cancelled", text: `Cancelled after ${String(finished.length)} of ${String(total)} attempts; no finding.` }
  if (fixture.status === "failed") {
    const errors = finished.filter((record) => record.outcome === "error").length
    return { state: "invalid", reason: "infra_errors", text: `Stopped after ${String(finished.length)} of ${String(total)} attempts with ${String(errors)} infrastructure errors; no finding.` }
  }
  if (reading === null) return null
  if (fixture.on === "dev") return { state: "signal", reason: "dev_split", text: `Signal on dev, not a finding: ${reading.measurement}.` }
  if (!context.judgeValidated) return { state: "signal", reason: "judge_not_validated", text: `Signal only, the judge is not validated: ${reading.measurement}.` }
  if (fixture.status !== "done") return null
  const settled = settledState(reading)
  return { ...settled, text: settledText(settled.state, reading) }
}

const classOf = (records: readonly AttemptRecord[]): StabilityClass | null => {
  if (records.length === 0) return null
  const passes = records.filter((record) => record.passed).length
  if (passes === records.length) return "always"
  if (passes === 0) return "never"
  return "flaky"
}

const stabilityOf = (fixture: SeriesFixture, context: SeriesContext, records: readonly AttemptRecord[]): readonly StabilityRow[] => {
  const finished = records.filter((record) => record.finished)
  if (fixture.repeats < 2 || finished.length === 0) return []
  return context.variants.map((variant) => {
    const classes = [...groupByCase(finished.filter((record) => record.variant === variant.id)).values()].map(classOf)
    return {
      variant: variant.id,
      always: classes.filter((item) => item === "always").length,
      never: classes.filter((item) => item === "never").length,
      flaky: classes.filter((item) => item === "flaky").length,
    }
  })
}

const plannedUsd = (fixture: SeriesFixture, context: SeriesContext): number =>
  sum(plannedAttempts(fixture, context).map((planned) => modelOf(fixture, planned.variant).usd))

export const seriesDetail = (fixture: SeriesFixture, context: SeriesContext): SeriesDetail => {
  const records = attemptRecords(fixture, context)
  const finished = records.filter((record) => record.finished)
  const columns = metricColumns(context.question, context.checks)
  const rows = context.variants.map((variant) => measuresOf(variant, records, columns, context.checks))
  const matrixRows: readonly MatrixRow[] = rows.map((row) => ({
    variant: row.variant.id,
    role: row.variant.role,
    cells: columns.map((item) => cellOf(context.question, rows, row, item)),
  }))
  return {
    id: seriesIdOf(fixture.key),
    origin: fixture.origin,
    flow: fixture.flow,
    dataset: context.dataset.id,
    on: fixture.on,
    cases: fixture.caseNames.length,
    repeats: fixture.repeats,
    variants: context.variants.map((variant) => variant.id),
    status: fixture.status,
    progress: { done: finished.length, total: plannedAttempts(fixture, context).length },
    spend: { usd: roundTo(sum(finished.map((record) => record.usd)), 4), capUsd: roundTo(plannedUsd(fixture, context) * CAP_FACTOR, 2) },
    verdict: verdictOf(fixture, context, primaryReading(context.question, rows, columns), records),
    waits: records.filter((record) => record.outcome === "waiting").length,
    startedAt: fixture.startedAt,
    finishedAt: fixture.finishedAt,
    question: context.question,
    checks: context.checks,
    matrix: { columns, rows: matrixRows },
    stability: stabilityOf(fixture, context, records),
  }
}

export const seriesSummary = (detail: SeriesDetail): SeriesSummary => {
  const { question, checks, matrix, stability, ...head } = detail
  return { ...head, question: question.kind }
}

const publicAttempt = (record: AttemptRecord): SeriesAttempt => ({
  run: record.run,
  variant: record.variant,
  repeat: record.repeat,
  passed: record.passed,
  outcome: record.outcome,
  failedChecks: record.failedChecks,
  usd: record.usd,
  latencyMs: record.latencyMs,
})

const tallyOf = (variant: VariantId, records: readonly AttemptRecord[], checks: readonly ExperimentCheck[]): VariantTally => {
  const own = records.filter((record) => record.variant === variant && record.finished)
  const failed = new Set(own.flatMap((record) => record.failedChecks))
  return {
    variant,
    passed: own.filter((record) => record.passed).length,
    total: own.length,
    failedChecks: checks.filter((check) => failed.has(check.id)).map((check) => check.id),
    usd: roundTo(sum(own.map((record) => record.usd)), 6),
  }
}

const caseRow = (caseName: string, records: readonly AttemptRecord[], context: SeriesContext): SeriesCaseRow => {
  const variants = context.variants.map((variant) => tallyOf(variant.id, records, context.checks))
  const classes = new Set(context.variants.map((variant) => classOf(records.filter((record) => record.variant === variant.id && record.finished))).filter((item) => item !== null))
  return {
    name: caseName,
    tags: context.dataset.cases.find((item) => item.name === caseName)?.tags ?? {},
    variants,
    usd: roundTo(sum(records.filter((record) => record.finished).map((record) => record.usd)), 6),
    failing: variants.some((tally) => tally.passed < tally.total),
    divergent: context.variants.length > 1 && classes.size > 1,
    attempts: records.map(publicAttempt),
  }
}

const FILTERS: readonly ((row: SeriesCaseRow, filter: SeriesCaseFilter) => boolean)[] = [
  (row, filter) => filter.failures !== true || row.failing,
  (row, filter) => filter.divergent !== true || row.divergent,
]

export const seriesCases = (fixture: SeriesFixture, context: SeriesContext, filter: SeriesCaseFilter): readonly SeriesCaseRow[] => {
  const groups = groupByCase(attemptRecords(fixture, context))
  return fixture.caseNames
    .flatMap((caseName) => {
      const records = groups.get(caseName)
      return records === undefined ? [] : [caseRow(caseName, records, context)]
    })
    .filter((row) => FILTERS.every((keep) => keep(row, filter)))
}
