import type { CallId, DatasetId, NodeId, RevisionId, RowId, RunId } from "./core"
import type { CheckResult, ContentPart, ProvenancedValue, Ratio } from "./shared"
import type { DiffOp, JudgeVerdict, NodeKind, Verdict } from "./vocabulary"

export type ModelInfo = {
  readonly provider: string
  readonly model: string
  readonly snapshot: string
  readonly api: string
  readonly region: string
  readonly quantization: string
  readonly context: string
  readonly billing: string
}
export type RoutingInfo = {
  readonly profile: string
  readonly order: readonly string[]
  readonly fallbackReason: string
  readonly retries: string
  readonly timeoutS: number
  readonly cassette: string
}
export type CallParams = {
  readonly temperature: number
  readonly top_p: number
  readonly max_tokens: { readonly value: number; readonly changedIn?: RevisionId; readonly previous?: number }
  readonly seed: number | null
  readonly stop: readonly string[]
  readonly response_format: string
}
export type Billing = {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly pricePer1k: { readonly inputUsd: number; readonly outputUsd: number }
  readonly attemptCostUsd: number
  readonly failedAttemptsCostUsd: number
  readonly callTotalUsd: number
}
export type FreezeEntry =
  | { readonly kind: "recorded"; readonly node: NodeId; readonly fromRun: RunId }
  | { readonly kind: "knowledge"; readonly value: string }
export type CallInput = {
  readonly parts: readonly ContentPart[]
  readonly slots: readonly ProvenancedValue[]
  readonly rowValues: readonly string[]
  readonly freeze: readonly FreezeEntry[]
}
export type CallPrompt = {
  readonly template: { readonly id: string; readonly revision: RevisionId; readonly text: string }
  readonly system: string
  readonly user: { readonly text: string; readonly tokens: number }
  readonly diff: readonly { readonly op: DiffOp; readonly text: string }[]
}
export type ParsedField = {
  readonly path: string
  readonly result: { readonly kind: "ok"; readonly length: number; readonly max?: number } | { readonly kind: "value"; readonly value: string } | { readonly kind: "empty" }
}
export type CallOutput = {
  readonly parts: readonly ContentPart[]
  readonly raw: { readonly tokens: number; readonly text: string }
  readonly parsed: { readonly type: string; readonly fields: readonly ParsedField[] }
  readonly validationErrors: readonly string[]
  readonly comparison: { readonly actual: string; readonly expected: string; readonly semantic: number; readonly factual: number }
}
export type JudgeVote = { readonly node: NodeId; readonly model: string; readonly score: number }
export type HistoryEntry = { readonly revision: RevisionId; readonly draft: boolean; readonly verdict: Verdict; readonly note: string }
export type CallChecks = {
  readonly assertions: readonly CheckResult[]
  readonly judges: { readonly quorum: number; readonly votes: readonly JudgeVote[]; readonly decision: { readonly verdict: JudgeVerdict } & Ratio }
  readonly history: { readonly entries: readonly HistoryEntry[]; readonly dataset: DatasetId }
}
export type CallDetail = {
  readonly id: CallId
  readonly runId: RunId
  readonly nodeId: NodeId
  readonly kind: NodeKind
  readonly branch: string
  readonly stage: number
  readonly row: RowId
  readonly attempt: number
  readonly attempts: number
  readonly totalCostUsd: number
  readonly model: ModelInfo
  readonly routing: RoutingInfo
  readonly params: CallParams
  readonly billing: Billing
  readonly input: CallInput
  readonly prompt: CallPrompt
  readonly output: CallOutput
  readonly checks: CallChecks
}
