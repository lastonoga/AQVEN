import type {
  AgentRef,
  ArmFlow,
  ApiAgentRef,
  ApiArm,
  ApiArmFlow,
  ApiSeriesAttempt,
  ApiCaseSelection,
  ApiCheck,
  ApiCheckSource,
  ApiContrast,
  ApiExperimentDetail,
  ApiExperimentSummary,
  ApiLatestSeries,
  ApiMatrixRow,
  ApiMetricCell,
  ApiMetricColumn,
  ApiQuestion,
  ApiSeriesCaseRow,
  ApiSeriesDetail,
  ApiSeriesEstimate,
  ApiSeriesEvent,
  ApiSeriesOrigin,
  ApiSeriesSummary,
  ApiStabilityRow,
  ApiSubject,
  ApiVariant,
  ApiVariantTally,
  CaseSelection,
  CheckSource,
  CheckSourceKind,
  Contrast,
  ExperimentArm,
  ExperimentCheck,
  ExperimentDetail,
  ExperimentQuestion,
  ExperimentSubject,
  ExperimentSummary,
  ExperimentVariant,
  Guardrail,
  LatestSeries,
  LaunchEstimate,
  LaunchRequest,
  MatrixRow,
  MetricCell,
  MetricColumn,
  MetricId,
  NodeRange,
  QuestionKind,
  SeriesAttempt,
  SeriesCaseRow,
  SeriesDetail,
  SeriesEvent,
  SeriesOrigin,
  SeriesSummary,
  SplitCounts,
  StabilityRow,
  SubjectKind,
  VariantId,
  VariantTally,
} from "@/domain"
import { isBuiltinMetric } from "@/domain"
import * as ids from "@/data/ids"

type Money = string | number | null | undefined

type PairFields = Omit<Extract<ExperimentQuestion, { kind: "compare" }>, "kind">

const NO_TEXT = ""
const DEFAULT_DIRECTION = "higher_is_better"
const DEFAULT_BOUND = "above"

export const money = (value: Money): number => {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const metricId = (raw: string): MetricId => (isBuiltinMetric(raw) ? raw : ids.checkId(raw))

const variantOrNull = (raw: string | null | undefined): VariantId | null => (raw === null || raw === undefined ? null : ids.variantId(raw))

const rangeOf = (from: string | null, to: string | null): NodeRange | null => {
  if (from === null || to === null) return null
  return { from: ids.nodeId(from), to: ids.nodeId(to) }
}

const agentOf = (agent: ApiAgentRef): AgentRef => ({ id: ids.agentId(agent.agent_id), model: agent.model })

const optionalAgent = (agent: ApiAgentRef | null | undefined): AgentRef | null => (agent === null || agent === undefined ? null : agentOf(agent))

const NO_RANGE: NodeRange = { from: ids.nodeId(NO_TEXT), to: ids.nodeId(NO_TEXT) }

const SUBJECTS: Readonly<Record<SubjectKind, (subject: ApiSubject) => ExperimentSubject>> = {
  flow: (subject) => ({ kind: "flow", flow: ids.flowId(subject.flow_id ?? NO_TEXT) }),
  range: (subject) => ({ kind: "range", flow: ids.flowId(subject.flow_id ?? NO_TEXT), range: rangeOf(subject.from_node, subject.to_node) ?? NO_RANGE }),
  arm: (subject) => ({ kind: "arm", arm: ids.armId(subject.arm_id ?? NO_TEXT), range: rangeOf(subject.from_node, subject.to_node) }),
}

export const subjectOf = (subject: ApiSubject): ExperimentSubject => SUBJECTS[subject.kind](subject)

const guardrailsOf = (question: ApiQuestion): readonly Guardrail[] =>
  question.guardrails.map((guard) => ({ metric: metricId(guard.metric), direction: guard.direction, margin: guard.margin, relative: guard.relative }))

const pairOf = (question: ApiQuestion): PairFields => ({
  baseline: ids.variantId(question.baseline ?? NO_TEXT),
  candidate: ids.variantId(question.candidate ?? NO_TEXT),
  primary: metricId(question.metric ?? NO_TEXT),
  direction: question.direction ?? DEFAULT_DIRECTION,
  margin: question.margin ?? 0,
  relative: question.relative,
  guardrails: guardrailsOf(question),
})

const QUESTIONS: Readonly<Record<QuestionKind, (question: ApiQuestion) => ExperimentQuestion>> = {
  look: () => ({ kind: "look" }),
  threshold: (question) => ({
    kind: "threshold",
    metric: metricId(question.metric ?? NO_TEXT),
    bound: question.bound ?? DEFAULT_BOUND,
    value: question.value ?? 0,
    margin: question.margin ?? 0,
    variant: variantOrNull(question.variant),
  }),
  compare: (question) => ({ kind: "compare", ...pairOf(question) }),
  noninferior: (question) => ({ kind: "noninferior", ...pairOf(question) }),
}

export const questionOf = (question: ApiQuestion): ExperimentQuestion => QUESTIONS[question.kind](question)

const SOURCES: Readonly<Record<CheckSourceKind, (source: ApiCheckSource) => CheckSource>> = {
  builtin: (source) => ({ kind: "builtin", use: source.use ?? NO_TEXT, fields: source.fields }),
  code: (source) => ({ kind: "code", ref: source.ref ?? NO_TEXT }),
  judge: (source) => ({
    kind: "judge",
    inference: source.inference ?? NO_TEXT,
    agent: optionalAgent(source.agent),
    validatedBy: source.validated_by === null || source.validated_by === undefined ? null : ids.experimentId(source.validated_by),
  }),
}

const checkOf = (check: ApiCheck): ExperimentCheck => ({ id: ids.checkId(check.check_id), kind: check.kind, source: SOURCES[check.source.kind](check.source) })

const columnOf = (column: ApiMetricColumn): MetricColumn => ({
  id: metricId(column.metric),
  role: column.role,
  direction: column.direction,
  unit: column.unit,
  margin: column.margin,
  relative: column.relative,
})

const armOf = (arm: ApiArm): ExperimentArm => ({
  id: ids.armId(arm.arm_id),
  description: arm.description,
  steps: arm.steps.map((step) => ({ node: ids.nodeId(step.node_id), kind: step.kind, agent: optionalAgent(step.agent), description: step.description })),
})

const variantOf = (variant: ApiVariant): ExperimentVariant => ({
  id: ids.variantId(variant.variant_id),
  arm: variant.arm_id === null ? null : ids.armId(variant.arm_id),
  role: variant.role,
  assignments: variant.assignments.map((assignment) => ({ node: ids.nodeId(assignment.node_id), agent: agentOf(assignment.agent), overridden: assignment.overridden })),
})

const splitsOf = (splits: Readonly<Record<string, number>>): SplitCounts => ({ dev: splits["dev"] ?? 0, holdout: splits["holdout"] ?? 0 })

const selectionOf = (cases: ApiCaseSelection): CaseSelection => ({
  dataset: ids.datasetId(cases.dataset_id),
  flow: cases.flow_id === null ? null : ids.flowId(cases.flow_id),
  tags: cases.tags,
  selected: cases.selected,
  total: cases.total,
  splits: splitsOf(cases.splits),
})

const latestOf = (latest: ApiLatestSeries | null): LatestSeries | null => {
  if (latest === null) return null
  return { id: ids.seriesId(latest.series_id), on: latest.on, status: latest.status, verdict: latest.verdict }
}

const headOf = (experiment: ApiExperimentSummary) => ({
  id: ids.experimentId(experiment.experiment_id),
  description: experiment.description,
  flow: experiment.flow_id === null ? null : ids.flowId(experiment.flow_id),
  subject: subjectOf(experiment.subject),
  failureMode: experiment.failure_mode,
  latest: latestOf(experiment.latest),
  seriesCount: experiment.series_count,
  spentUsd: money(experiment.spent_usd),
})

export const experimentSummaryOf = (experiment: ApiExperimentSummary): ExperimentSummary => ({
  ...headOf(experiment),
  question: experiment.question,
  variants: experiment.variants.map(ids.variantId),
  baseline: variantOrNull(experiment.baseline),
  candidate: variantOrNull(experiment.candidate),
})

export const experimentDetailOf = (experiment: ApiExperimentDetail): ExperimentDetail => ({
  ...headOf(experiment),
  question: questionOf(experiment.question_detail),
  arms: experiment.arms.map(armOf),
  cases: selectionOf(experiment.cases),
  variants: experiment.variant_details.map(variantOf),
  checks: experiment.checks.map(checkOf),
  metrics: experiment.metrics.map(columnOf),
  plan: { cases: experiment.plan.cases ?? null, repeats: experiment.plan.repeats },
  notes: experiment.notes,
  files: { spec: ids.filePath(experiment.files.spec), notes: experiment.files.notes === null ? null : ids.filePath(experiment.files.notes) },
})

export const estimateOf = (estimate: ApiSeriesEstimate): LaunchEstimate => ({
  request: { on: estimate.on, cases: estimate.cases, repeats: estimate.repeats },
  variants: estimate.variants,
  attempts: estimate.attempts,
  usd: estimate.usd === null ? null : money(estimate.usd),
  usdSource: estimate.usd_source,
  minutes: estimate.minutes,
  available: estimate.available,
  halfWidth: estimate.half_width,
  margin: estimate.margin,
  recommended: { cases: estimate.recommended.cases, repeats: estimate.recommended.repeats, reason: estimate.recommended.reason },
  belowRecommended: estimate.below_recommended,
  needsApproval: estimate.needs_approval,
  capUsd: money(estimate.cap_usd),
})

export const launchBody = (request: LaunchRequest) => ({ on: request.on, cases: request.cases, repeats: request.repeats })

const originOf = (origin: ApiSeriesOrigin): SeriesOrigin => {
  if (origin.kind === "experiment") return { kind: "experiment", experiment: ids.experimentId(origin.experiment_id) }
  return {
    kind: "look",
    flow: ids.flowId(origin.flow_id),
    dataset: ids.datasetId(origin.dataset_id),
    cases: origin.case_names,
    range: rangeOf(origin.start_node ?? null, origin.end_node ?? null),
  }
}

const seriesHeadOf = (series: ApiSeriesSummary) => ({
  id: ids.seriesId(series.series_id),
  origin: originOf(series.origin),
  flow: series.flow_id === null ? null : ids.flowId(series.flow_id),
  dataset: ids.datasetId(series.dataset_id),
  on: series.on,
  cases: series.cases,
  repeats: series.repeats,
  variants: series.variants.map(ids.variantId),
  status: series.status,
  progress: { done: series.progress.done, total: series.progress.total },
  spend: { usd: money(series.spend.usd), capUsd: money(series.spend.cap_usd) },
  verdict: series.verdict,
  waits: series.waits,
  startedAt: ids.isoDateTime(series.started_at),
  finishedAt: series.finished_at === null ? null : ids.isoDateTime(series.finished_at),
})

export const seriesSummaryOf = (series: ApiSeriesSummary): SeriesSummary => ({ ...seriesHeadOf(series), question: series.question })

const cellOf = (cell: ApiMetricCell): MetricCell => ({
  metric: metricId(cell.metric),
  value: cell.value,
  ciLow: cell.low,
  ciHigh: cell.high,
  verdict: cell.verdict,
  cases: cell.cases,
})

const rowOf = (row: ApiMatrixRow): MatrixRow => ({ variant: ids.variantId(row.variant_id), role: row.role, cells: row.cells.map(cellOf) })

const stabilityOf = (row: ApiStabilityRow): StabilityRow => ({ variant: ids.variantId(row.variant_id), always: row.always, never: row.never, flaky: row.flaky })

const contrastOf = (contrast: ApiContrast): Contrast => ({
  metric: metricId(contrast.metric),
  role: contrast.role,
  baseline: ids.variantId(contrast.baseline),
  candidate: ids.variantId(contrast.candidate),
  direction: contrast.direction,
  margin: contrast.margin,
  relative: contrast.relative,
  difference: { value: contrast.difference.value, low: contrast.difference.low, high: contrast.difference.high },
  verdict: contrast.verdict,
})

export const seriesDetailOf = (series: ApiSeriesDetail): SeriesDetail => ({
  ...seriesHeadOf(series),
  question: questionOf(series.question_detail),
  checks: series.checks.map(checkOf),
  matrix: { columns: series.matrix.columns.map(columnOf), rows: series.matrix.rows.map(rowOf) },
  stability: series.stability.map(stabilityOf),
  contrasts: series.contrasts.map(contrastOf),
  needsApproval: series.needs_approval,
  approvedBy: series.approved_by,
  findingPath: series.finding_path === null ? null : ids.filePath(series.finding_path),
  error: series.error,
})

const attemptOf = (attempt: ApiSeriesAttempt): SeriesAttempt => ({
  run: ids.runId(attempt.run_id),
  variant: ids.variantId(attempt.variant_id),
  repeat: attempt.repeat,
  passed: attempt.passed,
  outcome: attempt.outcome,
  failedChecks: attempt.failed_checks.map(ids.checkId),
  usd: money(attempt.usd),
  latencyMs: attempt.latency_ms,
  error: attempt.error ?? null,
})

const tallyOf = (tally: ApiVariantTally): VariantTally => ({
  variant: ids.variantId(tally.variant_id),
  passed: tally.passed,
  total: tally.total,
  failedChecks: tally.failed_checks.map(ids.checkId),
  usd: money(tally.usd),
})

export const caseRowOf = (row: ApiSeriesCaseRow): SeriesCaseRow => ({
  name: row.name,
  split: row.split,
  tags: row.tags,
  variants: row.variants.map(tallyOf),
  usd: money(row.usd),
  failing: row.failing,
  divergent: row.divergent,
  attempts: row.attempts.map(attemptOf),
})

export const seriesEventOf = (event: ApiSeriesEvent): SeriesEvent => {
  if (event.type === "series_status") return { kind: "status", seq: event.seq, status: event.status }
  if (event.type === "series_finished") return { kind: "finished", seq: event.seq, status: event.status, verdict: event.verdict }
  return { kind: "attempt", seq: event.seq, done: event.done, total: event.total, spendUsd: money(event.spend_usd) }
}

export const armFlowOf = (view: ApiArmFlow): ArmFlow => ({
  experiment: ids.experimentId(view.experiment_id),
  arm: ids.armId(view.arm_id),
  description: view.description,
  nodes: view.nodes,
  schemas: view.schemas,
})
