import type { CallId, ColumnId, ColumnPath, IsoDateTime, NodeId, RowId, RunId, StageId } from "./core"
import type { CheckResult, ContentPart, ProvenancedValue, Ratio, TextLine } from "./shared"
import type {
  AttemptResult,
  CallStatus,
  ChildLabel,
  ClaimVerdict,
  ColumnFlag,
  JudgeVerdict,
  ModelFamily,
  NodeKind,
  Outcome,
  OutputStatus,
  Reasoning,
  RowKey,
  RunStatus,
  StageKind,
} from "./vocabulary"

export type RunSummary = {
  readonly id: RunId
  readonly status: RunStatus
  readonly origin: { readonly kind: "baseline" } | { readonly kind: "fork"; readonly of: RunId }
  readonly costUsd: number
  readonly durationS: number
  readonly assertions: Ratio
  readonly startedAt: IsoDateTime
}

export type RunMetrics = {
  readonly cost: { readonly valueUsd: number; readonly previousUsd: number; readonly overEstimateUsd: number }
  readonly time: { readonly valueS: number; readonly medianS: number; readonly medianRuns: number; readonly traceGapS: number }
  readonly tokens: { readonly total: number; readonly growth: number; readonly discarded: number; readonly input: number; readonly output: number }
  readonly assertions: Ratio & { readonly failedRows: readonly RowId[]; readonly failureNote: string }
}

export type StageDescription =
  | { readonly kind: "toolCalls"; readonly count: number }
  | { readonly kind: "map"; readonly concurrency: number; readonly source: string }
  | { readonly kind: "pureFunction" }
  | { readonly kind: "families"; readonly count: number; readonly row?: RowId }
  | { readonly kind: "loop"; readonly body: string; readonly exit: { readonly kind: "stagnation" } | { readonly kind: "threshold"; readonly value: number } }
  | { readonly kind: "text"; readonly text: string }

export type AgentTitle =
  | { readonly kind: "model"; readonly family: ModelFamily; readonly model: string }
  | { readonly kind: "deterministic" }
  | { readonly kind: "panel"; readonly families: readonly ModelFamily[]; readonly judges: number; readonly fix: boolean; readonly fixNode?: NodeId }
  | { readonly kind: "text"; readonly text: string }

export type AgentCell = {
  readonly title?: AgentTitle
  readonly costUsd: number
  readonly costFactor?: number
  readonly breakdown?: { readonly judgesUsd: readonly number[]; readonly fixUsd: number | null }
  readonly durationS?: number
  readonly tokens?: { readonly input: number; readonly output: number } | "cassette"
  readonly calls?: number
  readonly waitingMinutes?: number
  readonly config?: { readonly agent: string; readonly temperature?: number; readonly reasoning?: Reasoning; readonly extra?: string }
}

export type InputCell =
  | { readonly kind: "refs"; readonly refs: readonly ProvenancedValue[]; readonly note?: string; readonly hash?: string; readonly frozen?: boolean; readonly row?: RowId }
  | { readonly kind: "text"; readonly lines: readonly TextLine[] }
  | { readonly kind: "parts"; readonly parts: readonly ContentPart[] }

export type OutputCell =
  | { readonly kind: "lines"; readonly lines: readonly TextLine[]; readonly truncated?: boolean }
  | { readonly kind: "parts"; readonly parts: readonly ContentPart[] }
  | { readonly kind: "verdict"; readonly verdict: JudgeVerdict | ClaimVerdict; readonly remark?: string; readonly score?: number }
  | { readonly kind: "status"; readonly status: OutputStatus; readonly case?: JudgeVerdict; readonly deadlineMinutes?: number }

export type ScoreFact = {
  readonly value: number
  readonly previous?: number
  readonly threshold?: number
  readonly stopped?: boolean
  readonly judges?: readonly number[]
  readonly expectedDelta?: number
}
export type Comparison = {
  readonly actual: string | null
  readonly expected: string
  readonly finding: { readonly kind: "close"; readonly delta: number } | { readonly kind: "violation"; readonly message: string }
}
export type CheckCell = {
  readonly score?: ScoreFact
  readonly ratio?: Ratio
  readonly comparison?: Comparison
  readonly checks?: readonly CheckResult[]
  readonly note?: { readonly text: string; readonly pass?: boolean }
  readonly judgeCount?: number
}

export type CallColumn = {
  readonly id: ColumnId
  readonly callId: CallId
  readonly nodeId?: NodeId
  readonly name: string
  readonly kind?: NodeKind
  readonly status?: CallStatus
  readonly family?: ModelFamily
  readonly subtitle?: string
  readonly case?: JudgeVerdict
  readonly flags?: readonly ColumnFlag[]
  readonly callText?: string
  readonly agent?: AgentCell
  readonly input?: InputCell
  readonly prompt?: readonly TextLine[]
  readonly output?: OutputCell
  readonly check?: CheckCell
  readonly child?: { readonly label: ChildLabel; readonly block: NestedBlock }
}

export type RowSpec = { readonly key: RowKey; readonly detail?: string }

export type MapSummary = {
  readonly hiddenCalls: number
  readonly totalUsd: number
  readonly medianS: number
  readonly typeName: string
  readonly spread: { readonly min: number; readonly max: number }
  readonly ok: Ratio
}

export type MatrixGroup = {
  readonly id: string
  readonly kind?: StageKind
  readonly rows: readonly RowSpec[]
  readonly columns: readonly CallColumn[]
  readonly shared?: { readonly input?: InputCell; readonly prompt?: readonly TextLine[] }
  readonly summary?: MapSummary
}

export type Attempt = {
  readonly n: number
  readonly durationS: number
  readonly outcome: string
  readonly link: string
  readonly tokens: { readonly input: number; readonly output: number }
  readonly costUsd: number
  readonly result: AttemptResult
}
export type AttemptLadder = {
  readonly columnId: ColumnId
  readonly callLabel: string
  readonly chain: string
  readonly attempts: readonly Attempt[]
  readonly billedUsd: number
  readonly failedUsd: number
}

export type ExitCondition =
  | { readonly kind: "iterations"; readonly used: number; readonly max: number; readonly fired: boolean }
  | { readonly kind: "budget"; readonly spentUsd: number; readonly limitUsd: number; readonly fired: boolean }
  | { readonly kind: "stagnation"; readonly delta: number; readonly epsilon: number; readonly fired: boolean }
  | { readonly kind: "threshold"; readonly score: number; readonly target: number; readonly afterFix: boolean; readonly fired: boolean }
  | { readonly kind: "repeatedCandidate"; readonly fired: boolean }
export type ExitSummary = { readonly conditions: readonly ExitCondition[]; readonly note?: string }

export type JoinResult = {
  readonly selected: NodeId
  readonly score: number
  readonly dropped: readonly { readonly branch: string; readonly billed: boolean }[]
}

export type StageRun = {
  readonly id: StageId
  readonly ordinal?: number
  readonly kind: StageKind
  readonly fanOut?: number
  readonly title: string
  readonly description: StageDescription
  readonly costUsd: number
  readonly durationS: number | null
  readonly groups: readonly MatrixGroup[]
  readonly attempts?: AttemptLadder
  readonly exit?: ExitSummary
  readonly join?: JoinResult
}

export type NestedBlock = {
  readonly kind: StageKind
  readonly fanOut: number
  readonly titleParts: readonly string[]
  readonly quorum?: { readonly required: number; readonly total: number }
  readonly group: MatrixGroup
}

export type RunOutcome = {
  readonly status: Outcome
  readonly billedUsd: number
  readonly traceGap?: { readonly seconds: number; readonly fromStage: number; readonly toStage: number }
}

export type DataflowRun = {
  readonly run: RunSummary
  readonly metrics: RunMetrics
  readonly stages: readonly StageRun[]
  readonly outcome: RunOutcome
  readonly defaultOpen: readonly ColumnPath[]
}
