export const LOCALES = ["en"] as const
export type Locale = (typeof LOCALES)[number]
export const MODES = ["schema", "dataflow", "nodes", "tests", "review"] as const
export type Mode = (typeof MODES)[number]
export const CALL_SHEET_TABS = ["model", "input", "prompt", "output", "assertions"] as const
export type CallSheetTab = (typeof CALL_SHEET_TABS)[number]
export const INSPECTOR_TABS = ["overview", "input", "prompt", "output", "source"] as const
export type InspectorTab = (typeof INSPECTOR_TABS)[number]

export type Outcome = "ok" | "degraded" | "failed" | "cached" | "idle" | "waiting" | "skipped" | "aborted" | "awaiting" | "intermediate"
export type RunStatus = Extract<Outcome, "ok" | "degraded" | "failed">
export type TestHealth = Extract<Outcome, "ok" | "degraded" | "failed">
export type CallStatus = Extract<Outcome, "ok" | "degraded" | "failed" | "cached" | "idle" | "waiting" | "skipped" | "aborted">
export type OutputStatus = Extract<Outcome, "skipped" | "awaiting" | "aborted">
export type AttemptResult = Extract<Outcome, "ok" | "degraded" | "failed">

export type Verdict = "pass" | "fail"
export type JudgeVerdict = "approved" | "needs_human" | "rejected"
export type ClaimVerdict = "matched" | "invented"

export type NodeKind = "tool" | "llm" | "fn" | "human" | "image" | "audio" | "video"
export type StageKind = "seq" | "map" | "diverge" | "parallel" | "loop" | "switch"
export type Provenance = "static" | "data" | "knowledge" | "generated" | "human"
export type ModelFamily = "anthropic" | "openai" | "google" | "mistral"
export type PartKind = "text" | "json" | "image" | "audio" | "document" | "video"
export type Reasoning = "off" | "low" | "medium" | "high"
export type GatewayMode = "all" | "one"
export type ColumnFlag = "loopBody" | "best" | "selected"
export type RowKey = "columns" | "call" | "agent" | "model" | "input" | "prompt" | "output" | "postCheck" | "assertions"
export type ExitKind = "iterations" | "budget" | "stagnation" | "threshold" | "repeatedCandidate"
export type ChildLabel = "loop" | "judges" | "map"
export type CheckKind = "validator" | "scorer"
export type RegistryKind = "signature" | "profile" | "adapter" | "type"
export type BindingSource = "literal" | "node_output" | "knowledge" | "human" | "state"
export type RevisionStatus = "draft" | "applied"
export type DecisionKind = "approve" | "changes" | "reject"
export type DiffOp = "add" | "remove"
