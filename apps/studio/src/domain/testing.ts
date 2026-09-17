import type { DatasetId, IsoDateTime, NodeId, RevisionId, RowId, RunId, StageId, TestId } from "./core"
import type { StageRun } from "./run"
import type { Ratio } from "./shared"
import type { NodeKind, TestHealth, Verdict } from "./vocabulary"

export type StageShape = { readonly kind: "parallel"; readonly branches: number } | { readonly kind: "loop"; readonly threshold: number }
export type TestScope =
  | { readonly kind: "call"; readonly nodeId: NodeId; readonly stage: number; readonly role: string }
  | { readonly kind: "stage"; readonly name: string; readonly stage: number; readonly shape: StageShape }
  | { readonly kind: "workflow"; readonly entryNodeId: NodeId }
export type TestSummary = {
  readonly id: TestId
  readonly scope: TestScope
  readonly datasetId: DatasetId
  readonly pass: Ratio
  readonly health: TestHealth
  readonly lastRunAt: IsoDateTime
}
export type DatasetSource =
  | { readonly kind: "spreadsheet"; readonly agentExtended: boolean }
  | { readonly kind: "agent"; readonly fromRun: RunId; readonly toRun: RunId }
  | { readonly kind: "tool"; readonly adapter: string }
  | { readonly kind: "manual" }
export type DatasetSummary = {
  readonly id: DatasetId
  readonly rowCount: number
  readonly description: string
  readonly source: DatasetSource
  readonly assertionCount: number
  readonly usedByTestCount: number
  readonly updatedAt: IsoDateTime
}
export type TestsOverview = { readonly tests: readonly TestSummary[]; readonly datasets: readonly DatasetSummary[] }

export type DatasetColumn = { readonly key: string; readonly label: string }
export type DatasetRow = {
  readonly id: RowId
  readonly ordinal: number
  readonly values: Readonly<Record<string, string | number>>
  readonly assertionCount: number
  readonly verdict: Verdict
  readonly context: readonly string[]
}
export type Dataset = {
  readonly id: DatasetId
  readonly rowCount: number
  readonly assertionCount: number
  readonly source: DatasetSource
  readonly columns: readonly DatasetColumn[]
  readonly rows: readonly DatasetRow[]
}
export type TestRunSummary = { readonly rows: number; readonly passed: number; readonly costUsd: number; readonly durationS: number; readonly passDelta: number }
export type RowResult = {
  readonly rowId: RowId
  readonly verdict: Verdict
  readonly selectedBranch: NodeId
  readonly iterations: number
  readonly calls: number
  readonly costUsd: number
  readonly durationS: number
  readonly delta: number
}
export type DatasetRunRef = { readonly revision: RevisionId; readonly draft: boolean; readonly pass: Ratio; readonly costUsd: number }
export type RunHistory = { readonly previous: DatasetRunRef; readonly current: DatasetRunRef; readonly changeSummary: string }
export type TestDetail = {
  readonly id: TestId
  readonly target: { readonly nodeId: NodeId; readonly kind: NodeKind }
  readonly stage: { readonly index: number; readonly name: string; readonly stageId: StageId }
  readonly frozenAncestorCount: number
  readonly promptSource: { readonly draftRevision: RevisionId; readonly cassette: boolean }
  readonly summary: TestRunSummary
  readonly dataset: Dataset
  readonly results: readonly RowResult[]
  readonly runHistory: RunHistory
}
export type RowOutcome = { readonly verdict: Verdict; readonly failedAssertion: string; readonly branch: string; readonly totalCostUsd: number; readonly calls: number }
export type RowTrace = { readonly rowId: RowId; readonly steps: readonly StageRun[]; readonly outcome: RowOutcome }
