import type { ApiExecutionAddress, ApiJsonObject, ApiProblemRow, ApiValueRef, ExecutionStatus, NodeKind } from "@/domain"
import type { TextLine } from "@/components/studio"

export const ROW_KEYS = ["call", "agent", "model", "input", "prompt", "output", "postCheck"] as const

export type RowKey = (typeof ROW_KEYS)[number]

export type CoordinateKind = "branch" | "iteration" | "item"

export type Coordinate = { readonly kind: CoordinateKind; readonly value: string }

export type ValueIdentity = {
  readonly kind: ApiValueRef["kind"]
  readonly hash: string | null
  readonly mediaType: string | null
  readonly bytes: number | null
}

export type MediaRef = {
  readonly slot: string
  readonly mediaType: string
  readonly blobId: string
  readonly bytes: number
  readonly name: string | null
  readonly posterBlobId?: string | null
}

export type ValueCell = {
  readonly ref: ApiValueRef
  readonly identity: ValueIdentity
  readonly value: unknown
  readonly incomplete: boolean
  readonly text: string
  readonly lines: readonly TextLine[]
  readonly media: readonly MediaRef[]
}

export type UpstreamRef = {
  readonly nodeId: string
  readonly cell: ValueCell | null
}

export type InputCell =
  | { readonly kind: "recorded"; readonly value: ValueCell }
  | { readonly kind: "upstream"; readonly refs: readonly UpstreamRef[] }

export type AgentCell = {
  readonly agent: string | null
  readonly model: string | null
  readonly inference: string | null
  readonly profile: string | null
  readonly costUsd: number
  readonly latencyMs: number | null
  readonly tokensIn: number
  readonly tokensOut: number
  readonly cacheHit: boolean
  readonly degraded: boolean
}

export type PromptCell = {
  readonly kind: "captured" | "missing"
  readonly inference: string | null
  readonly level: number | null
  readonly lines: readonly TextLine[]
}

export type CheckFinding = {
  readonly name: string
  readonly pass: boolean
  readonly note: string | null
}

export type CheckCell = {
  readonly findings: readonly CheckFinding[]
  readonly rules: readonly ApiJsonObject[]
  readonly failedAttempts: number
}

export type NestedBlock = {
  readonly kind: NodeKind
  readonly fanOut: number
  readonly group: MatrixGroup
}

export type CallColumn = {
  readonly id: string
  readonly address: ApiExecutionAddress
  readonly name: string
  readonly kind: NodeKind
  readonly status: ExecutionStatus
  readonly summary: string | null
  readonly coordinate: Coordinate | null
  readonly agent: AgentCell
  readonly input: InputCell | null
  readonly prompt: PromptCell | null
  readonly output: ValueCell | null
  readonly rawResponse: string | null
  readonly check: CheckCell | null
  readonly child: NestedBlock | null
}

export type RowSpec = { readonly key: RowKey }

export type MatrixGroup = {
  readonly id: string
  readonly kind: NodeKind
  readonly rows: readonly RowSpec[]
  readonly columns: readonly CallColumn[]
}

export type AttemptRow = {
  readonly attempt: number
  readonly kind: string
  readonly code: string | null
  readonly action: string
  readonly message: string
  readonly hint: string | null
  readonly rawExcerpt: string | null
  readonly problems: readonly ApiProblemRow[]
}

export type AttemptLadder = {
  readonly columnId: string
  readonly callLabel: string
  readonly attempts: readonly AttemptRow[]
}

export type ExitSummary = {
  readonly reason: string
  readonly selectedIteration: number | null
  readonly scores: readonly (number | null)[]
}

export type StageRun = {
  readonly id: string
  readonly ordinal: number
  readonly nodeId: string
  readonly kind: NodeKind
  readonly status: ExecutionStatus
  readonly costUsd: number
  readonly latencyMs: number | null
  readonly fanOut: number
  readonly groups: readonly MatrixGroup[]
  readonly ladders: readonly AttemptLadder[]
  readonly exit: ExitSummary | null
}

export type TraceRun = {
  readonly stages: readonly StageRun[]
  readonly pending: readonly string[]
}
