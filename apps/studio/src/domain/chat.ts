import type { CallId, ColumnId, DatasetId, NodeId, RevisionId, RunId } from "./core"
import type { Ratio } from "./shared"
import type { RevisionStatus } from "./vocabulary"

export type ToolName = "read_run" | "patch_spec" | "run_dataset"
export type AttemptCode = "http_429" | "schema_invalid" | "truncated" | "fallback"
export type ReadRunArgs = { readonly runId: RunId; readonly nodeId: NodeId }
export type ReadRunResult = {
  readonly attempts: readonly AttemptCode[]
  readonly billedUsd: number
  readonly failedUsd: number
  readonly callId: CallId
  readonly columnId: ColumnId
}
export type SpecChange =
  | { readonly kind: "field"; readonly nodeId: NodeId; readonly field: string; readonly from: string; readonly to: string }
  | { readonly kind: "knowledge"; readonly knowledgeId: string; readonly from: string; readonly to: string; readonly note: string }
export type PatchSpecArgs = { readonly instruction: string }
export type PatchSpecProgress = { readonly target: NodeId; readonly step: number; readonly totalSteps: number }
export type PatchSpecResult = {
  readonly revision: RevisionId
  readonly nodeCount: number
  readonly changes: readonly SpecChange[]
  readonly branchesAffected: number
  readonly runEstimateUsd: number
  readonly state: RevisionStatus | "reverted"
}
export type DatasetScore = Ratio & { readonly datasetId: DatasetId; readonly costUsd: number }
export type RunDatasetArgs = { readonly datasetId: DatasetId }
export type RunDatasetResult = {
  readonly scores: readonly DatasetScore[]
  readonly callMode: "live" | "cassette"
  readonly recordCassette: boolean
  readonly runId: RunId | null
}

export type ToolCallFields = {
  readonly read_run: { readonly args: ReadRunArgs; readonly result?: ReadRunResult }
  readonly patch_spec: { readonly args: PatchSpecArgs; readonly result?: PatchSpecResult; readonly artifact?: PatchSpecProgress }
  readonly run_dataset: { readonly args: RunDatasetArgs; readonly result?: RunDatasetResult }
}
export type ChatToolCallPart<N extends ToolName = ToolName> = {
  readonly [K in N]: { readonly type: "tool-call"; readonly toolCallId: string; readonly toolName: K; readonly isError?: boolean } & ToolCallFields[K]
}[N]
export type ChatTextPart = { readonly type: "text"; readonly text: string }
export type ChatMessagePart = ChatTextPart | ChatToolCallPart
export type ChatMessageStatus = { readonly type: "running" } | { readonly type: "complete"; readonly reason: "stop" }
export type ChatMessage =
  | { readonly id: string; readonly role: "user"; readonly content: string }
  | { readonly id: string; readonly role: "assistant"; readonly status: ChatMessageStatus; readonly content: readonly ChatMessagePart[] }
export type ChatThread = readonly ChatMessage[]
