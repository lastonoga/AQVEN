import type { DatasetId, IsoDateTime, NodeId, ReviewId, RevisionId, RowId, RunId } from "./core"
import type { CheckResult } from "./shared"
import type { DecisionKind, ExitKind, JudgeVerdict } from "./vocabulary"

export type ReviewTrigger =
  | { readonly kind: "verdict"; readonly verdict: JudgeVerdict; readonly required: JudgeVerdict }
  | { readonly kind: "humanInput"; readonly slot: string }
export type ReviewSla = { readonly budgetMinutes: number | null; readonly dueAt: IsoDateTime }
export type SlaState = { readonly kind: "onTrack"; readonly remainingMinutes: number } | { readonly kind: "overdue"; readonly overdueMinutes: number }
export type ReviewQueueItem = {
  readonly id: ReviewId
  readonly runId: RunId
  readonly stage: number
  readonly nodeId: NodeId
  readonly kind: "approval" | "input"
  readonly status: "pending" | "escalated"
  readonly trigger: ReviewTrigger
  readonly sla: ReviewSla
}
export type ReviewDetail = {
  readonly id: ReviewId
  readonly row: RowId
  readonly branch: string
  readonly produced: { readonly title: string; readonly highlights: readonly string[] }
  readonly call: {
    readonly nodeId: NodeId
    readonly model: string
    readonly temperature: number
    readonly prompt: { readonly id: string; readonly revision: RevisionId }
    readonly costUsd: number
    readonly durationS: number
    readonly postChecks: readonly CheckResult[]
  }
  readonly escalation: { readonly verdict: JudgeVerdict; readonly summary: string }
  readonly judges: readonly { readonly judge: string; readonly score: number }[]
  readonly loop: { readonly iterations: number; readonly stopReason: ExitKind }
  readonly expected: { readonly title: string }
  readonly dataset: { readonly id: DatasetId; readonly ordinal: number; readonly rowCount: number }
}
export type DecisionCommand = { readonly reviewId: ReviewId; readonly decision: DecisionKind; readonly note: string }
