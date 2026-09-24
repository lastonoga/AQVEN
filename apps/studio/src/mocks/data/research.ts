import type {
  ApiArm,
  ApiSeriesAttempt,
  ApiContrast,
  ApiExperimentDetail,
  ApiLaunchPlan,
  ApiLaunchRequest,
  ApiMatrixRow,
  ApiMetricCell,
  ApiMetricColumn,
  ApiQuestion,
  ApiSeriesCaseRow,
  ApiSeriesDetail,
  ApiSeriesOrigin,
  ApiSeriesSummary,
  ApiSeriesVerdict,
  ApiStabilityRow,
  ApiVariantTally,
  AttemptOutcome,
  CellVerdict,
  SeriesSplit,
  SeriesStatus,
  VariantRole,
} from "@/domain"
import { liveExperiments } from "./experiments"

type Split = Readonly<Record<SeriesSplit, readonly string[]>>

export type LookStages = { readonly start: string; readonly end: string }

export type LookSeed = { readonly flow: string; readonly dataset: string; readonly cases: readonly string[]; readonly stages: LookStages | null }

type Variant = { readonly id: string; readonly role: VariantRole; readonly passRate: number; readonly usd: number }

export type SeriesSeed = {
  readonly id: string
  readonly experiment: string | null
  readonly look: LookSeed | null
  readonly on: SeriesSplit
  readonly repeats: number
  readonly cases: readonly string[]
  readonly status: SeriesStatus
  readonly done: number | null
  readonly verdict: ApiSeriesVerdict | null
  readonly startedAt: string
  readonly finishedAt: string | null
  readonly passRates: Readonly<Record<string, number>>
  readonly cellVerdict: CellVerdict
  readonly waiting: Readonly<Record<string, string>>
  readonly errorEvery: number
  readonly unpriced: number
}

export type SeriesState = SeriesSeed & { readonly approvedBy: string | null }

export type Attempt = ApiSeriesAttempt & { readonly caseName: string; readonly split: SeriesSplit; readonly ordinal: number }

type Counted = { readonly passed: number; readonly total: number }

export type LaunchBody = ApiLaunchRequest & { readonly experiment_id?: string | null; readonly look?: LookSeed | null }

const CAP_USD = "1.00"
const START_PAUSE = { reason: "cap_above_project", spent_usd: "0" } as const
const APPROVAL_LIMIT = 1
const USD_PER_ATTEMPT = 0.0125
const SPREAD = 0.25
const ICC = 0.3
const Z = 1.96
const MAX_RECOMMENDED = 999
const LOOK_VARIANT = "current"
const HASH_SEED = 2166136261
const HASH_PRIME = 16777619
const HASH_SPACE = 10000
const BASE_LATENCY_MS = 1800
const LATENCY_SPREAD_MS = 2600
const WAITING_OUTCOME: AttemptOutcome = "waiting"
const INFRA_ERROR = "OpenRouter answered 502 Bad Gateway for mistralai/mistral-nemo"

export const RESEARCH_SERIES = {
  noninferiorHoldout: "01a0c100-0000-7000-8000-000000000001",
  noninferiorDev: "01a0c100-0000-7000-8000-000000000002",
  overpromiseAwaiting: "01a0c100-0000-7000-8000-000000000003",
  escalationRunning: "01a0c100-0000-7000-8000-000000000004",
  critiqueDev: "01a0c100-0000-7000-8000-000000000005",
  panelFailed: "01a0c100-0000-7000-8000-000000000006",
  panelRefuted: "01a0c100-0000-7000-8000-000000000007",
  splitInconclusive: "01a0c100-0000-7000-8000-000000000008",
  lookWaiting: "01a0c100-0000-7000-8000-000000000009",
} as const

export const LOOK_WAITING_RUNS = {
  form: "01a0c1ff-0000-7000-8000-00000000f001",
  approval: "01a0c1ff-0000-7000-8000-00000000f002",
} as const

const numbered = (prefix: string, count: number, offset = 0): readonly string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}_${String(index + offset + 1).padStart(2, "0")}`)

export const CASE_NAMES: Readonly<Record<string, Split>> = {
  support_case_cases: {
    dev: ["strip_flicker_credit", "bulb_app_offline_advice", "lamp_crushed_box_reship", "candle_flicker_credit", "dimmer_buzz_advice", "hub_missing_mount_reship"],
    holdout: ["arc_floor_burning_smell_replacement", "nova_gift_warranty_question", "nova_no_charge_replacement", "nova_runtime_advice", "strip_dead_segment_replacement", "zigbee_pairing_advice"],
  },
  planted_defect_replies: { dev: numbered("planted_reply", 9), holdout: numbered("planted_reply", 7, 9) },
  long_customer_messages: { dev: numbered("long_message", 6), holdout: numbered("long_message", 6, 6) },
  judge_panel_cases: { dev: numbered("panel_case", 3), holdout: numbered("panel_case", 5, 3) },
}

const SUPPORT_TAGS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  strip_flicker_credit: { lamp_kind: "smart_wifi", channel: "amazon", action: "store_credit", regression: "no" },
  bulb_app_offline_advice: { lamp_kind: "smart_wifi", channel: "storefront", action: "advice", regression: "yes" },
  lamp_crushed_box_reship: { lamp_kind: "mains", channel: "ozon", action: "reship", regression: "yes" },
  candle_flicker_credit: { lamp_kind: "smart_zigbee", channel: "storefront", action: "store_credit", regression: "yes" },
  dimmer_buzz_advice: { lamp_kind: "mains", channel: "ozon", action: "advice", regression: "yes" },
  hub_missing_mount_reship: { lamp_kind: "none", channel: "amazon", action: "reship", regression: "no" },
}

const BUILTIN_COLUMNS: readonly ApiMetricColumn[] = [
  { metric: "success_rate", role: "builtin", direction: "higher_is_better", unit: "rate", margin: null, relative: false },
  { metric: "cost_usd", role: "builtin", direction: "lower_is_better", unit: "usd", margin: null, relative: false },
  { metric: "latency_p50_ms", role: "builtin", direction: "lower_is_better", unit: "ms", margin: null, relative: false },
  { metric: "latency_p95_ms", role: "builtin", direction: "lower_is_better", unit: "ms", margin: null, relative: false },
  { metric: "schema_valid_first_try", role: "builtin", direction: "higher_is_better", unit: "rate", margin: null, relative: false },
  { metric: "infra_error_rate", role: "builtin", direction: "lower_is_better", unit: "rate", margin: null, relative: false },
]

const LOOK_QUESTION: ApiQuestion = { kind: "look", relative: false, guardrails: [] }

const casesOf = (dataset: string, on: SeriesSplit, count: number): readonly string[] => (CASE_NAMES[dataset]?.[on] ?? []).slice(0, count)

const seed = (fields: Partial<SeriesSeed> & Pick<SeriesSeed, "id" | "on" | "status" | "startedAt">): SeriesSeed => ({
  experiment: null,
  look: null,
  repeats: 3,
  cases: [],
  done: null,
  verdict: null,
  finishedAt: null,
  passRates: {},
  cellVerdict: "pass",
  waiting: {},
  errorEvery: 0,
  unpriced: 0,
  ...fields,
})

const SEEDS: readonly SeriesSeed[] = [
  seed({
    id: RESEARCH_SERIES.noninferiorHoldout,
    experiment: "reply_noninferior_mistral",
    on: "holdout",
    cases: casesOf("support_case_cases", "holdout", 6),
    status: "done",
    startedAt: "2026-09-21T14:05:18Z",
    finishedAt: "2026-09-21T14:39:52Z",
    passRates: { gpt: 0.86, mistral: 0.82 },
    verdict: {
      state: "confirmed",
      reason: null,
      text: "mistral is not worse than gpt on critique: the difference -0.02 (95% CI -0.04 to 0.01) clears the 0.05 margin; cost per pass stays within 20%.",
    },
  }),
  seed({
    id: RESEARCH_SERIES.noninferiorDev,
    experiment: "reply_noninferior_mistral",
    on: "dev",
    cases: casesOf("support_case_cases", "dev", 6),
    status: "done",
    startedAt: "2026-09-20T09:12:04Z",
    finishedAt: "2026-09-20T09:31:40Z",
    passRates: { gpt: 0.83, mistral: 0.8 },
    verdict: { state: "signal", reason: "dev_split", text: "Signal on working cases: mistral looks not worse than gpt on critique; confirm it on held-out cases." },
  }),
  seed({
    id: RESEARCH_SERIES.overpromiseAwaiting,
    experiment: "reply_overpromise_risk",
    on: "holdout",
    repeats: 20,
    cases: casesOf("support_case_cases", "holdout", 6),
    status: "awaiting_approval",
    done: 0,
    startedAt: "2026-09-23T07:55:40Z",
    passRates: { gpt: 0.97 },
  }),
  seed({
    id: RESEARCH_SERIES.escalationRunning,
    experiment: "intent_escalation_agents",
    on: "dev",
    cases: casesOf("support_case_cases", "dev", 6),
    status: "running",
    done: 20,
    startedAt: "2026-09-23T08:40:09Z",
    passRates: { deepseek: 0.9, qwen: 0.75, gpt: 0.88 },
  }),
  seed({
    id: RESEARCH_SERIES.critiqueDev,
    experiment: "critique_planted_defects",
    on: "dev",
    cases: casesOf("planted_defect_replies", "dev", 9),
    status: "done",
    startedAt: "2026-09-22T08:30:12Z",
    finishedAt: "2026-09-22T08:41:55Z",
    passRates: { deepseek: 0.9 },
    verdict: { state: "signal", reason: "dev_split", text: "Signal on working cases: deepseek keeps label above 0.85; confirm it on held-out cases." },
  }),
  seed({
    id: RESEARCH_SERIES.panelFailed,
    experiment: "panel_single_judge",
    on: "holdout",
    cases: casesOf("judge_panel_cases", "holdout", 5),
    status: "failed",
    done: 30,
    startedAt: "2026-09-22T17:10:33Z",
    finishedAt: "2026-09-22T17:24:51Z",
    passRates: { panel: 0.8, single_judge: 0.7, single_judge_qwen: 0.65 },
    errorEvery: 4,
    cellVerdict: "unclear",
    verdict: { state: "invalid", reason: "infra_errors", text: "No finding: 8 of 30 attempts hit infrastructure errors." },
  }),
  seed({
    id: RESEARCH_SERIES.panelRefuted,
    experiment: "judge_panel_agents",
    on: "holdout",
    cases: casesOf("judge_panel_cases", "holdout", 5),
    status: "done",
    startedAt: "2026-09-18T16:20:44Z",
    finishedAt: "2026-09-18T16:52:13Z",
    passRates: { gpt_tie_break: 0.8, deepseek_tie_break: 0.6 },
    cellVerdict: "fail",
    verdict: { state: "refuted", reason: null, text: "deepseek_tie_break does not beat gpt_tie_break on winner: the difference -0.20 (95% CI -0.38 to -0.02) is below zero." },
  }),
  seed({
    id: RESEARCH_SERIES.splitInconclusive,
    experiment: "intent_split_long_messages",
    on: "holdout",
    cases: casesOf("long_customer_messages", "holdout", 6),
    status: "done",
    startedAt: "2026-09-19T11:02:31Z",
    finishedAt: "2026-09-19T11:14:07Z",
    passRates: { one_step: 0.7, two_step: 0.78 },
    unpriced: 6,
    cellVerdict: "unclear",
    verdict: { state: "inconclusive", reason: "uninformative", text: "Not clear whether two_step beats one_step on intent: the interval -0.06 to 0.22 spans the 0.05 margin." },
  }),
  seed({
    id: RESEARCH_SERIES.lookWaiting,
    look: { flow: "support_case", dataset: "support_case_cases", cases: ["strip_flicker_credit", "bulb_app_offline_advice", "lamp_crushed_box_reship"], stages: null },
    on: "dev",
    repeats: 1,
    cases: ["strip_flicker_credit", "bulb_app_offline_advice", "lamp_crushed_box_reship"],
    status: "waiting_human",
    done: 1,
    startedAt: "2026-09-23T06:10:15Z",
    passRates: { [LOOK_VARIANT]: 1 },
    waiting: { bulb_app_offline_advice: LOOK_WAITING_RUNS.form, lamp_crushed_box_reship: LOOK_WAITING_RUNS.approval },
  }),
]

export const initialSeries = (): readonly SeriesState[] => SEEDS.map((item) => ({ ...item, approvedBy: null }))

const unit = (key: string): number => {
  let hash = HASH_SEED
  for (const char of key) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, HASH_PRIME)
  }
  return ((hash >>> 0) % HASH_SPACE) / HASH_SPACE
}

const round = (value: number, digits: number): number => Number(value.toFixed(digits))

const money = (value: number): string => value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")

export const experimentOf = (id: string | null): ApiExperimentDetail | null =>
  id === null ? null : liveExperiments.find((experiment) => experiment.experiment_id === id) ?? null

const variantsOf = (series: SeriesSeed): readonly Variant[] => {
  const experiment = experimentOf(series.experiment)
  const details = experiment?.variant_details ?? [{ variant_id: LOOK_VARIANT, role: "other" as const }]
  return details.map((detail, index) => ({
    id: detail.variant_id,
    role: detail.role,
    passRate: series.passRates[detail.variant_id] ?? 0.8,
    usd: round(USD_PER_ATTEMPT * (1 + index * 0.2), 4),
  }))
}

const splitOf = (series: SeriesSeed, name: string): SeriesSplit => {
  const dataset = datasetOf(series)
  return CASE_NAMES[dataset]?.holdout.includes(name) === true ? "holdout" : "dev"
}

export const datasetOf = (series: SeriesSeed): string => series.look?.dataset ?? experimentOf(series.experiment)?.cases.dataset_id ?? ""

const runIdOf = (series: SeriesSeed, ordinal: number): string =>
  `${series.id.slice(0, 24)}${String(ordinal + 1).padStart(4, "0")}${series.id.slice(-8)}`

const primaryCheck = (series: SeriesSeed): string | null => experimentOf(series.experiment)?.checks[0]?.check_id ?? null

const plannedAttempts = (series: SeriesSeed): readonly Omit<Attempt, "outcome" | "passed" | "failed_checks" | "error">[] => {
  const variants = variantsOf(series)
  const rows = Array.from({ length: series.repeats }, (_, repeat) =>
    series.cases.flatMap((caseName) => variants.map((variant) => ({ caseName, variant, repeat: repeat + 1 }))),
  ).flat()
  return rows.map((row, ordinal) => {
    const key = `${series.id}/${row.caseName}/${row.variant.id}/${String(row.repeat)}`
    return {
      run_id: runIdOf(series, ordinal),
      variant_id: row.variant.id,
      repeat: row.repeat,
      usd: money(row.variant.usd * (0.85 + unit(`${key}/usd`) * 0.3)),
      latency_ms: Math.round(BASE_LATENCY_MS + unit(`${key}/ms`) * LATENCY_SPREAD_MS),
      caseName: row.caseName,
      split: splitOf(series, row.caseName),
      ordinal,
    }
  })
}

export const totalOf = (series: SeriesSeed): number => series.cases.length * series.repeats * variantsOf(series).length

const doneOf = (series: SeriesSeed): number => series.done ?? totalOf(series)

const isError = (series: SeriesSeed, ordinal: number): boolean => series.errorEvery > 0 && ordinal % series.errorEvery === series.errorEvery - 1

const finishedAttempt = (series: SeriesSeed, planned: ReturnType<typeof plannedAttempts>[number]): Attempt => {
  const variant = variantsOf(series).find((item) => item.id === planned.variant_id)
  if (isError(series, planned.ordinal)) return { ...planned, passed: false, outcome: "error", failed_checks: [], error: INFRA_ERROR }
  const passed = unit(`${series.id}/${planned.caseName}/${planned.variant_id}/${String(planned.repeat)}`) < (variant?.passRate ?? 0.8)
  const check = primaryCheck(series)
  return { ...planned, passed, outcome: passed ? "passed" : "failed", failed_checks: passed || check === null ? [] : [check], error: null }
}

const pendingAttempt = (series: SeriesSeed, planned: ReturnType<typeof plannedAttempts>[number], index: number): Attempt | null => {
  const waitingRun = series.waiting[planned.caseName]
  if (waitingRun !== undefined) return { ...planned, run_id: waitingRun, passed: false, outcome: WAITING_OUTCOME, failed_checks: [], usd: "0", latency_ms: 0, error: null }
  if (series.status === "running" && index === 0) return { ...planned, passed: false, outcome: "running", failed_checks: [], usd: "0", latency_ms: 0, error: null }
  return null
}

export const attemptsOf = (series: SeriesSeed): readonly Attempt[] => {
  const planned = plannedAttempts(series)
  const done = doneOf(series)
  const finished = planned.slice(0, done).map((item) => finishedAttempt(series, item))
  const pending = planned.slice(done).flatMap((item, index) => pendingAttempt(series, item, index) ?? [])
  return [...finished, ...pending]
}

const isCounted = (attempt: Attempt): boolean => attempt.outcome === "passed" || attempt.outcome === "failed"

const countOf = (attempts: readonly Attempt[]): Counted => {
  const counted = attempts.filter(isCounted)
  return { passed: counted.filter((attempt) => attempt.passed).length, total: counted.length }
}

const interval = (value: number, total: number, spread: number): { readonly low: number; readonly high: number } => {
  const half = total === 0 ? 0 : Z * Math.sqrt(Math.max(spread, 0.0001) / total)
  return { low: round(Math.max(0, value - half), 4), high: round(Math.min(1, value + half), 4) }
}

const percentile = (values: readonly number[], share: number): number => {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0
}

const sumUsd = (attempts: readonly Attempt[]): number => attempts.reduce((total, attempt) => total + Number(attempt.usd), 0)

type CellValue = { readonly value: number; readonly low: number; readonly high: number }

const rateCell = (attempts: readonly Attempt[]): CellValue | null => {
  const { passed, total } = countOf(attempts)
  if (total === 0) return null
  const value = round(passed / total, 4)
  return { value, ...interval(value, total, value * (1 - value)) }
}

const scoreCell = (attempts: readonly Attempt[]): CellValue | null => {
  const rate = rateCell(attempts)
  if (rate === null) return null
  const value = round(0.55 + rate.value * 0.35, 4)
  return { value, low: round(value - 0.04, 4), high: round(Math.min(1, value + 0.04), 4) }
}

const usdCell = (attempts: readonly Attempt[], perPass: boolean): CellValue | null => {
  const finished = attempts.filter(isCounted)
  const { passed } = countOf(attempts)
  const divisor = perPass ? passed : finished.length
  if (divisor === 0) return null
  const value = round(sumUsd(finished) / divisor, 6)
  return { value, low: round(value * 0.9, 6), high: round(value * 1.1, 6) }
}

const latencyCell = (attempts: readonly Attempt[], share: number): CellValue | null => {
  const finished = attempts.filter(isCounted)
  if (finished.length === 0) return null
  const value = percentile(finished.map((attempt) => attempt.latency_ms), share)
  return { value, low: Math.round(value * 0.9), high: Math.round(value * 1.1) }
}

const errorRateCell = (attempts: readonly Attempt[]): CellValue | null => {
  const closed = attempts.filter((attempt) => isCounted(attempt) || attempt.outcome === "error")
  if (closed.length === 0) return null
  const value = round(closed.filter((attempt) => attempt.outcome === "error").length / closed.length, 4)
  return { value, ...interval(value, closed.length, value * (1 - value)) }
}

const METRIC_CELLS: Readonly<Record<string, (attempts: readonly Attempt[]) => CellValue | null>> = {
  success_rate: rateCell,
  cost_usd: (attempts) => usdCell(attempts, false),
  cost_of_pass: (attempts) => usdCell(attempts, true),
  latency_p50_ms: (attempts) => latencyCell(attempts, 0.5),
  latency_p95_ms: (attempts) => latencyCell(attempts, 0.95),
  schema_valid_first_try: rateCell,
  infra_error_rate: errorRateCell,
}

const UNIT_CELLS: Readonly<Record<ApiMetricColumn["unit"], (attempts: readonly Attempt[]) => CellValue | null>> = {
  rate: rateCell,
  score: scoreCell,
  ordinal: scoreCell,
  usd: (attempts) => usdCell(attempts, false),
  ms: (attempts) => latencyCell(attempts, 0.5),
}

const valueOf = (column: ApiMetricColumn, attempts: readonly Attempt[]): CellValue | null =>
  (METRIC_CELLS[column.metric] ?? UNIT_CELLS[column.unit])(attempts)

const cellVerdictOf = (series: SeriesSeed, column: ApiMetricColumn, role: VariantRole, question: ApiQuestion["kind"]): CellVerdict => {
  if (column.role !== "primary" && column.role !== "guardrail") return "none"
  if (role === "baseline") return "reference"
  if (question === "look") return "none"
  return series.cellVerdict
}

const cellOf = (series: SeriesSeed, column: ApiMetricColumn, variant: Variant, attempts: readonly Attempt[], question: ApiQuestion["kind"]): ApiMetricCell => {
  const own = attempts.filter((attempt) => attempt.variant_id === variant.id)
  const measured = valueOf(column, own)
  const cases = new Set(own.filter(isCounted).map((attempt) => attempt.caseName)).size
  return {
    metric: column.metric,
    value: measured?.value ?? null,
    low: measured?.low ?? null,
    high: measured?.high ?? null,
    verdict: measured === null ? "none" : cellVerdictOf(series, column, variant.role, question),
    method: measured === null ? null : "wilson",
    cases,
  }
}

const columnsOf = (series: SeriesSeed): readonly ApiMetricColumn[] => experimentOf(series.experiment)?.metrics ?? BUILTIN_COLUMNS

const questionOf = (series: SeriesSeed): ApiQuestion => experimentOf(series.experiment)?.question_detail ?? LOOK_QUESTION

const matrixRows = (series: SeriesSeed, attempts: readonly Attempt[]): readonly ApiMatrixRow[] =>
  variantsOf(series).map((variant) => ({
    variant_id: variant.id,
    role: variant.role,
    cells: columnsOf(series).map((column) => cellOf(series, column, variant, attempts, questionOf(series).kind)),
  }))

const stabilityOf = (series: SeriesSeed, attempts: readonly Attempt[]): readonly ApiStabilityRow[] =>
  variantsOf(series).map((variant) => {
    const perCase = series.cases.map((name) => countOf(attempts.filter((attempt) => attempt.variant_id === variant.id && attempt.caseName === name)))
    const seen = perCase.filter((count) => count.total > 0)
    return {
      variant_id: variant.id,
      always: seen.filter((count) => count.passed === count.total).length,
      never: seen.filter((count) => count.passed === 0).length,
      flaky: seen.filter((count) => count.passed > 0 && count.passed < count.total).length,
    }
  })

const contrastOf = (series: SeriesSeed, rows: readonly ApiMatrixRow[], column: ApiMetricColumn, question: ApiQuestion): ApiContrast | null => {
  const baseline = rows.find((row) => row.variant_id === question.baseline)?.cells.find((cell) => cell.metric === column.metric)
  const candidate = rows.find((row) => row.variant_id === question.candidate)?.cells.find((cell) => cell.metric === column.metric)
  if (column.role !== "primary" && column.role !== "guardrail") return null
  if (baseline?.value == null || candidate?.value == null) return null
  const difference = round(candidate.value - baseline.value, 4)
  return {
    metric: column.metric,
    role: column.role,
    baseline: question.baseline ?? "",
    candidate: question.candidate ?? "",
    direction: column.direction,
    margin: column.margin ?? 0,
    relative: column.relative,
    margin_abs: column.margin,
    difference: { value: difference, low: round(difference - 0.03, 4), high: round(difference + 0.03, 4), method: "paired_t", cases: candidate.cases, attempts: 0 },
    verdict: series.cellVerdict,
  }
}

const contrastsOf = (series: SeriesSeed, rows: readonly ApiMatrixRow[]): readonly ApiContrast[] => {
  const question = questionOf(series)
  if (question.kind !== "compare" && question.kind !== "noninferior") return []
  return columnsOf(series).flatMap((column) => contrastOf(series, rows, column, question) ?? [])
}

const tallyOf = (attempts: readonly Attempt[], variant: string): ApiVariantTally => {
  const own = attempts.filter((attempt) => attempt.variant_id === variant)
  const { passed, total } = countOf(own)
  return {
    variant_id: variant,
    passed,
    total,
    failed_checks: [...new Set(own.flatMap((attempt) => attempt.failed_checks))],
    usd: money(sumUsd(own)),
  }
}

const tagsOf = (name: string): Readonly<Record<string, string>> => SUPPORT_TAGS[name] ?? {}

export const caseRowsOf = (series: SeriesSeed): readonly ApiSeriesCaseRow[] => {
  const attempts = attemptsOf(series)
  const variants = variantsOf(series)
  return series.cases.map((name) => {
    const own = attempts.filter((attempt) => attempt.caseName === name)
    const tallies = variants.map((variant) => tallyOf(own, variant.id))
    const rates = new Set(tallies.filter((tally) => tally.total > 0).map((tally) => tally.passed / tally.total))
    const rows: ApiSeriesAttempt[] = own.map(({ caseName: _case, split: _split, ordinal: _ordinal, ...attempt }) => attempt)
    return {
      name,
      split: splitOf(series, name),
      tags: { ...tagsOf(name) },
      variants: tallies,
      usd: money(sumUsd(own)),
      failing: own.some((attempt) => attempt.outcome === "failed" || attempt.outcome === "error"),
      divergent: rates.size > 1,
      attempts: rows,
    }
  })
}

const originOf = (series: SeriesSeed): ApiSeriesOrigin => {
  if (series.look !== null) {
    const { flow, dataset, cases, stages } = series.look
    return { kind: "look", flow_id: flow, dataset_id: dataset, case_names: [...cases], start_node: stages?.start ?? null, end_node: stages?.end ?? null }
  }
  return { kind: "experiment", experiment_id: series.experiment ?? "" }
}

const flowOf = (series: SeriesSeed): string | null => series.look?.flow ?? experimentOf(series.experiment)?.subject.flow_id ?? null

export const summaryOf = (series: SeriesState): ApiSeriesSummary => {
  const attempts = attemptsOf(series)
  return {
    series_id: series.id,
    origin: originOf(series),
    flow_id: flowOf(series),
    dataset_id: datasetOf(series),
    question: questionOf(series).kind,
    on: series.on,
    cases: series.cases.length,
    repeats: series.repeats,
    variants: variantsOf(series).map((variant) => variant.id),
    status: series.status,
    progress: { done: doneOf(series), total: totalOf(series) },
    spend: { usd: money(sumUsd(attempts)), cap_usd: CAP_USD, unpriced_attempts: series.unpriced },
    verdict: series.verdict,
    waits: attempts.filter((attempt) => attempt.outcome === WAITING_OUTCOME).length,
    started_at: series.startedAt,
    finished_at: series.finishedAt,
    pause: series.status === "awaiting_approval" ? START_PAUSE : null,
  }
}

const halfWidth = (cases: number, repeats: number): number => Z * SPREAD / Math.sqrt((cases * repeats) / (1 + (repeats - 1) * ICC))

const neededCases = (margin: number, repeats: number): number => {
  const found = Array.from({ length: MAX_RECOMMENDED }, (_, index) => index + 1).find((cases) => halfWidth(cases, repeats) <= margin)
  return found ?? MAX_RECOMMENDED
}

const recommendationOf = (question: ApiQuestion, cases: number, repeats: number, available: number): ApiLaunchPlan["recommended"] => {
  if (question.kind === "look") return { cases, repeats, reason: "look", text: `a look runs ${String(cases)} cases once each and gives no verdict` }
  const margin = question.margin ?? 0
  if (margin <= 0) return { cases, repeats, reason: "no_margin", text: "the question has no margin" }
  const needed = neededCases(margin, repeats)
  if (needed > available) return { cases: needed, repeats, reason: "short_of_cases", text: `about ${String(needed)} cases are needed, but only ${String(available)} are available` }
  return { cases: needed, repeats, reason: needed > cases ? "wide" : "enough", text: `about ${String(needed)} cases are needed` }
}

export const launchPlanFor = (experiment: ApiExperimentDetail, request: LaunchBody): ApiLaunchPlan => {
  const { on } = request
  const available = experiment.cases.splits[on] ?? 0
  const cases = Math.min(request.cases ?? experiment.plan.cases ?? experiment.cases.selected, available)
  const repeats = request.repeats ?? experiment.plan.repeats
  const variants = experiment.variant_details.length
  const attempts = cases * repeats * variants
  const question = experiment.question_detail
  const recommended = recommendationOf(question, cases, repeats, available)
  const hasMargin = question.kind !== "look" && (question.margin ?? 0) > 0
  return {
    on,
    cases,
    repeats,
    variants,
    attempts,
    available,
    half_width: hasMargin ? round(halfWidth(Math.max(cases, 1), repeats), 4) : null,
    mde: null,
    margin: question.kind === "look" ? null : question.margin ?? null,
    spread: hasMargin ? SPREAD : null,
    spread_source: hasMargin ? "prior" : "none",
    icc: ICC,
    recommended,
    below_recommended: cases < recommended.cases,
    needs_approval: Number(request.cap_usd ?? 0) > APPROVAL_LIMIT,
    project_cap_usd: CAP_USD,
    cap_usd: CAP_USD,
    warnings: recommended.reason === "short_of_cases" ? ["short_of_cases"] : [],
  }
}

const seriesLaunchPlan = (series: SeriesState): ApiLaunchPlan => {
  const experiment = experimentOf(series.experiment)
  const cases = series.cases.length
  if (experiment !== null) return launchPlanFor(experiment, { on: series.on, cases, repeats: series.repeats })
  const attempts = cases * series.repeats
  return {
    on: series.on,
    cases,
    repeats: series.repeats,
    variants: 1,
    attempts,
    available: cases,
    half_width: null,
    mde: null,
    margin: null,
    spread: null,
    spread_source: "none",
    icc: ICC,
    recommended: recommendationOf(LOOK_QUESTION, cases, series.repeats, cases),
    below_recommended: false,
    needs_approval: false,
    project_cap_usd: CAP_USD,
    cap_usd: CAP_USD,
    warnings: [],
  }
}

export const detailOf = (series: SeriesState): ApiSeriesDetail => {
  const attempts = attemptsOf(series)
  const rows = matrixRows(series, attempts)
  return {
    ...summaryOf(series),
    question_detail: questionOf(series),
    checks: experimentOf(series.experiment)?.checks ?? [],
    matrix: { columns: [...columnsOf(series)], rows: [...rows] },
    stability: [...stabilityOf(series, attempts)],
    contrasts: [...contrastsOf(series, rows)],
    thresholds: [],
    aggregates: [],
    launch: seriesLaunchPlan(series),
    needs_approval: series.status === "awaiting_approval",
    approved_by: series.approvedBy,
    finding_path: series.on === "holdout" && series.status === "done" ? `experiments/${series.experiment ?? ""}/findings/${series.id}.yaml` : null,
    error: series.status === "failed" ? "8 of 30 attempts hit infrastructure errors" : null,
  }
}

export const attemptRun = (states: readonly SeriesState[], runId: string): { readonly series: SeriesState; readonly attempt: Attempt } | null => {
  const found = states.flatMap((series) => attemptsOf(series).filter((attempt) => attempt.run_id === runId).map((attempt) => ({ series, attempt })))
  return found[0] ?? null
}

export const armOf = (series: SeriesSeed): ApiArm | null => {
  const experiment = experimentOf(series.experiment)
  const armId = experiment?.subject.arm_id ?? null
  if (experiment === null || armId === null) return null
  return experiment.arms.find((arm) => arm.arm_id === armId) ?? null
}

export const subjectFlowOf = (series: SeriesSeed): string => {
  const experiment = experimentOf(series.experiment)
  return flowOf(series) ?? experiment?.subject.arm_id ?? ""
}
