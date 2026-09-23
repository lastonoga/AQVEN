import type { AgentId, ArmId, CheckId, DatasetId, ExperimentId, FilePath, FlowId, IsoDateTime, NodeId, RunId, SeriesId, VariantId } from "./core"
import type { ApiFlowSchemas, ApiNode } from "./live"
import type { NodeKind } from "./vocabulary"

export const QUESTION_KINDS = ["look", "threshold", "compare", "noninferior"] as const
export type QuestionKind = (typeof QUESTION_KINDS)[number]

export const SUBJECT_KINDS = ["flow", "range", "arm"] as const
export type SubjectKind = (typeof SUBJECT_KINDS)[number]

export const CHECK_KINDS = ["binary", "continuous", "ordinal"] as const
export type CheckKind = (typeof CHECK_KINDS)[number]

export const CHECK_SOURCES = ["builtin", "code", "judge"] as const
export type CheckSourceKind = (typeof CHECK_SOURCES)[number]

export const BUILTIN_METRICS = [
  "success_rate",
  "cost_usd",
  "cost_of_pass",
  "latency_p50_ms",
  "latency_p95_ms",
  "schema_valid_first_try",
  "infra_error_rate",
] as const
export type BuiltinMetric = (typeof BUILTIN_METRICS)[number]

export type MetricId = CheckId | BuiltinMetric

export const isBuiltinMetric = (metric: string): metric is BuiltinMetric => BUILTIN_METRICS.some((item) => item === metric)

export const METRIC_ROLES = ["primary", "guardrail", "check", "builtin"] as const
export type MetricRole = (typeof METRIC_ROLES)[number]

export const METRIC_DIRECTIONS = ["higher_is_better", "lower_is_better"] as const
export type MetricDirection = (typeof METRIC_DIRECTIONS)[number]

export const METRIC_UNITS = ["rate", "score", "ordinal", "usd", "ms"] as const
export type MetricUnit = (typeof METRIC_UNITS)[number]

export const THRESHOLD_BOUNDS = ["above", "below"] as const
export type ThresholdBound = (typeof THRESHOLD_BOUNDS)[number]

export const VARIANT_ROLES = ["baseline", "candidate", "other"] as const
export type VariantRole = (typeof VARIANT_ROLES)[number]

export const SERIES_SPLITS = ["dev", "holdout"] as const
export type SeriesSplit = (typeof SERIES_SPLITS)[number]

export const SERIES_STATUSES = ["running", "awaiting_approval", "waiting_human", "done", "cancelled", "failed"] as const
export type SeriesStatus = (typeof SERIES_STATUSES)[number]

export const ACTIVE_SERIES_STATUSES = ["running", "awaiting_approval", "waiting_human"] as const
export type ActiveSeriesStatus = (typeof ACTIVE_SERIES_STATUSES)[number]

export const VERDICT_STATES = ["confirmed", "refuted", "inconclusive", "invalid", "signal"] as const
export type VerdictState = (typeof VERDICT_STATES)[number]

export const VERDICT_REASONS = [
  "below_mde",
  "uninformative",
  "no_discordance",
  "compute_confounded",
  "inputs_changed",
  "infra_errors",
  "cancelled",
  "no_data",
  "budget_cut",
  "dev_split",
  "judge_not_validated",
] as const
export type VerdictReason = (typeof VERDICT_REASONS)[number]

export const CELL_VERDICTS = ["pass", "fail", "unclear", "reference", "none"] as const
export type CellVerdict = (typeof CELL_VERDICTS)[number]

export const STABILITY_CLASSES = ["always", "never", "flaky"] as const
export type StabilityClass = (typeof STABILITY_CLASSES)[number]

export const ATTEMPT_OUTCOMES = ["passed", "failed", "error", "waiting", "running"] as const
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number]

export const ESTIMATE_REASONS = ["look", "wide", "enough", "no_margin", "no_history", "short_of_cases"] as const
export type EstimateReason = (typeof ESTIMATE_REASONS)[number]

export const USD_SOURCES = ["history", "prices", "bound", "unknown"] as const
export type UsdSource = (typeof USD_SOURCES)[number]

export type CaseTags = Readonly<Record<string, string>>

export type AgentRef = { readonly id: AgentId; readonly model: string }

export type NodeRange = { readonly from: NodeId; readonly to: NodeId }

export type ArmStep = {
  readonly node: NodeId
  readonly kind: NodeKind
  readonly agent: AgentRef | null
  readonly description: string
}

export type ExperimentArm = { readonly id: ArmId; readonly description: string; readonly steps: readonly ArmStep[] }

export type ExperimentSubject =
  | { readonly kind: "flow"; readonly flow: FlowId }
  | { readonly kind: "range"; readonly flow: FlowId; readonly range: NodeRange }
  | { readonly kind: "arm"; readonly arm: ArmId; readonly range: NodeRange | null }

export type SplitCounts = Readonly<Record<SeriesSplit, number>>

export type CaseSelection = {
  readonly dataset: DatasetId
  readonly flow: FlowId | null
  readonly tags: CaseTags
  readonly selected: number
  readonly total: number
  readonly splits: SplitCounts
}

export type VariantAssignment = { readonly node: NodeId; readonly agent: AgentRef; readonly overridden: boolean }

export type ExperimentVariant = {
  readonly id: VariantId
  readonly arm: ArmId | null
  readonly role: VariantRole
  readonly assignments: readonly VariantAssignment[]
}

export type CheckSource =
  | { readonly kind: "builtin"; readonly use: string; readonly fields: readonly string[] }
  | { readonly kind: "code"; readonly ref: string }
  | { readonly kind: "judge"; readonly inference: string; readonly agent: AgentRef | null; readonly validatedBy: ExperimentId | null }

export type ExperimentCheck = { readonly id: CheckId; readonly kind: CheckKind; readonly source: CheckSource }

export type Guardrail = {
  readonly metric: MetricId
  readonly direction: MetricDirection
  readonly margin: number
  readonly relative: boolean
}

type PairQuestion = {
  readonly baseline: VariantId
  readonly candidate: VariantId
  readonly primary: MetricId
  readonly direction: MetricDirection
  readonly margin: number
  readonly relative: boolean
  readonly guardrails: readonly Guardrail[]
}

export type LookQuestion = { readonly kind: "look" }

export type ThresholdQuestion = {
  readonly kind: "threshold"
  readonly metric: MetricId
  readonly bound: ThresholdBound
  readonly value: number
  readonly margin: number
  readonly variant: VariantId | null
}

export type CompareQuestion = { readonly kind: "compare" } & PairQuestion

export type NoninferiorQuestion = { readonly kind: "noninferior" } & PairQuestion

export type ExperimentQuestion = LookQuestion | ThresholdQuestion | CompareQuestion | NoninferiorQuestion

export type MetricColumn = {
  readonly id: MetricId
  readonly role: MetricRole
  readonly direction: MetricDirection
  readonly unit: MetricUnit
  readonly margin: number | null
  readonly relative: boolean
}

export type ExperimentPlan = { readonly cases: number | null; readonly repeats: number }

export type LatestSeries = {
  readonly id: SeriesId
  readonly on: SeriesSplit
  readonly status: SeriesStatus
  readonly verdict: VerdictState | null
}

type ExperimentHead = {
  readonly id: ExperimentId
  readonly description: string
  readonly flow: FlowId | null
  readonly subject: ExperimentSubject
  readonly failureMode: string | null
  readonly latest: LatestSeries | null
  readonly seriesCount: number
  readonly spentUsd: number
}

export type ExperimentSummary = ExperimentHead & {
  readonly question: QuestionKind
  readonly variants: readonly VariantId[]
  readonly baseline: VariantId | null
  readonly candidate: VariantId | null
}

export type ExperimentFiles = { readonly spec: FilePath; readonly notes: FilePath | null }

export type ExperimentDetail = ExperimentHead & {
  readonly question: ExperimentQuestion
  readonly arms: readonly ExperimentArm[]
  readonly cases: CaseSelection
  readonly variants: readonly ExperimentVariant[]
  readonly checks: readonly ExperimentCheck[]
  readonly metrics: readonly MetricColumn[]
  readonly plan: ExperimentPlan
  readonly notes: string | null
  readonly files: ExperimentFiles
}

export type ExperimentFilter = {
  readonly flow?: FlowId
  readonly question?: QuestionKind
  readonly failureMode?: string
}

export type LaunchRequest = { readonly on: SeriesSplit; readonly cases: number; readonly repeats: number }

export type LaunchRecommendation = { readonly cases: number; readonly repeats: number; readonly reason: EstimateReason }

export type LaunchEstimate = {
  readonly request: LaunchRequest
  readonly variants: number
  readonly attempts: number
  readonly usd: number | null
  readonly usdSource: UsdSource
  readonly minutes: number | null
  readonly available: number
  readonly halfWidth: number | null
  readonly margin: number | null
  readonly recommended: LaunchRecommendation
  readonly belowRecommended: boolean
  readonly needsApproval: boolean
  readonly capUsd: number
}

export type SeriesOrigin =
  | { readonly kind: "experiment"; readonly experiment: ExperimentId }
  | { readonly kind: "look"; readonly flow: FlowId; readonly dataset: DatasetId; readonly cases: readonly string[]; readonly range: NodeRange | null }

export type SeriesVerdict = { readonly state: VerdictState; readonly reason: VerdictReason | null; readonly text: string }

export type SeriesProgress = { readonly done: number; readonly total: number }

export type SeriesSpend = { readonly usd: number; readonly capUsd: number; readonly unpricedAttempts: number }

type SeriesHead = {
  readonly id: SeriesId
  readonly origin: SeriesOrigin
  readonly flow: FlowId | null
  readonly dataset: DatasetId
  readonly on: SeriesSplit
  readonly cases: number
  readonly repeats: number
  readonly variants: readonly VariantId[]
  readonly status: SeriesStatus
  readonly progress: SeriesProgress
  readonly spend: SeriesSpend
  readonly verdict: SeriesVerdict | null
  readonly waits: number
  readonly startedAt: IsoDateTime
  readonly finishedAt: IsoDateTime | null
}

export type SeriesSummary = SeriesHead & { readonly question: QuestionKind }

export type MetricCell = {
  readonly metric: MetricId
  readonly value: number | null
  readonly ciLow: number | null
  readonly ciHigh: number | null
  readonly verdict: CellVerdict
  readonly cases: number
}

export type MatrixRow = { readonly variant: VariantId; readonly role: VariantRole; readonly cells: readonly MetricCell[] }

export type SeriesMatrix = { readonly columns: readonly MetricColumn[]; readonly rows: readonly MatrixRow[] }

export type StabilityRow = { readonly variant: VariantId; readonly always: number; readonly never: number; readonly flaky: number }

export type Interval = { readonly value: number | null; readonly low: number | null; readonly high: number | null }

export const CONTRAST_ROLES = ["primary", "guardrail"] as const
export type ContrastRole = (typeof CONTRAST_ROLES)[number]

export type Contrast = {
  readonly metric: MetricId
  readonly role: ContrastRole
  readonly baseline: VariantId
  readonly candidate: VariantId
  readonly direction: MetricDirection
  readonly margin: number
  readonly relative: boolean
  readonly difference: Interval
  readonly verdict: CellVerdict
}

export type SeriesDetail = SeriesHead & {
  readonly question: ExperimentQuestion
  readonly checks: readonly ExperimentCheck[]
  readonly matrix: SeriesMatrix
  readonly stability: readonly StabilityRow[]
  readonly contrasts: readonly Contrast[]
  readonly needsApproval: boolean
  readonly approvedBy: string | null
  readonly findingPath: FilePath | null
  readonly error: string | null
}

export type SeriesAttempt = {
  readonly run: RunId
  readonly variant: VariantId
  readonly repeat: number
  readonly passed: boolean
  readonly outcome: AttemptOutcome
  readonly failedChecks: readonly CheckId[]
  readonly usd: number
  readonly latencyMs: number
  readonly error: string | null
}

export type VariantTally = {
  readonly variant: VariantId
  readonly passed: number
  readonly total: number
  readonly failedChecks: readonly CheckId[]
  readonly usd: number
}

export type SeriesCaseRow = {
  readonly name: string
  readonly split: SeriesSplit
  readonly tags: CaseTags
  readonly variants: readonly VariantTally[]
  readonly usd: number
  readonly failing: boolean
  readonly divergent: boolean
  readonly attempts: readonly SeriesAttempt[]
}

export type SeriesCaseFilter = { readonly failures?: boolean; readonly divergent?: boolean }

export type SeriesEvent =
  | { readonly kind: "status"; readonly seq: number; readonly status: SeriesStatus }
  | { readonly kind: "attempt"; readonly seq: number; readonly done: number; readonly total: number; readonly spendUsd: number }
  | { readonly kind: "finished"; readonly seq: number; readonly status: SeriesStatus; readonly verdict: VerdictState | null }

export type ArmFlow = {
  readonly experiment: ExperimentId
  readonly arm: ArmId
  readonly description: string | null
  readonly nodes: readonly ApiNode[]
  readonly schemas: ApiFlowSchemas
}
