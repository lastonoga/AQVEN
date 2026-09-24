import type { components } from "@/api/schema"

type Schemas = components["schemas"]
type SameSet<E extends string, T extends string> = [Exclude<E, T> | Exclude<T, E>] extends [never] ? true : false
type SameNumbers<E extends number, T extends number> = [Exclude<E, T> | Exclude<T, E>] extends [never] ? true : false
type Verified<T extends true> = T

export const LOCALES = ["en"] as const
export type Locale = (typeof LOCALES)[number]

export const NODE_KINDS = ["llm", "code", "tool", "human", "parallel", "map", "switch", "loop", "call", "narrow"] as const
export type NodeKind = (typeof NODE_KINDS)[number]

export const RUN_STATUSES = ["queued", "running", "suspended", "completed", "failed", "cancelled"] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export const TERMINAL_RUN_STATUSES = ["completed", "failed", "cancelled"] as const
export type TerminalRunStatus = (typeof TERMINAL_RUN_STATUSES)[number]

export const EXECUTION_STATUSES = ["pending", "running", "ok", "failed", "skipped", "suspended", "cancelled"] as const
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number]

export const RUN_MODES = ["live", "replay", "experiment", "dryrun"] as const
export type RunMode = (typeof RUN_MODES)[number]

export const COMPILE_STATUSES = ["ok", "not_runnable", "invalid", "unreadable"] as const
export type CompileStatus = (typeof COMPILE_STATUSES)[number]

export const INDEX_STATUSES = ["ready", "building", "degraded"] as const
export type IndexStatus = (typeof INDEX_STATUSES)[number]

export const WAIT_KINDS = ["form", "tool_approval"] as const
export type WaitKind = (typeof WAIT_KINDS)[number]

export const WAIT_STATES = ["waiting", "resolved", "timed_out"] as const
export type WaitState = (typeof WAIT_STATES)[number]

export const ON_TIMEOUT_ACTIONS = ["fail", "default", "escalate"] as const
export type OnTimeoutAction = (typeof ON_TIMEOUT_ACTIONS)[number]

export const APPROVAL_DECISIONS = ["allow", "deny"] as const
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number]

export const ITEM_RECOVERY_DECISIONS = ["default", "skip"] as const
export type ItemRecoveryDecision = (typeof ITEM_RECOVERY_DECISIONS)[number]

export const TYPE_KINDS = ["record", "enum", "union", "id", "value"] as const
export type TypeKind = (typeof TYPE_KINDS)[number]

export const SEVERITIES = ["error", "warning"] as const
export type Severity = (typeof SEVERITIES)[number]

export const LINEAGE_RELATIONS = ["fork", "replay"] as const
export type LineageRelation = (typeof LINEAGE_RELATIONS)[number]

export const SPEC_ORIGINS = ["working_copy", "release"] as const
export type SpecOrigin = (typeof SPEC_ORIGINS)[number]

export const SETTING_SCOPES = ["studio", "project"] as const
export type SettingScope = (typeof SETTING_SCOPES)[number]

export const MODALITIES = ["text", "image", "audio", "video", "document"] as const
export type Modality = (typeof MODALITIES)[number]

export const MODEL_FAMILIES = [
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "qwen",
  "moonshot",
  "zhipu",
  "xai",
  "meta",
  "mistral",
  "other",
] as const
export type ModelFamily = (typeof MODEL_FAMILIES)[number]

export const PROMPT_LEVELS = [1, 2, 3] as const
export type PromptLevel = (typeof PROMPT_LEVELS)[number]

export type EngineVocabularyIsCurrent = [
  Verified<SameSet<Schemas["NodeKind"], NodeKind>>,
  Verified<SameSet<Schemas["RunStatus"], RunStatus>>,
  Verified<SameSet<Schemas["TerminalRunStatus"], TerminalRunStatus>>,
  Verified<SameSet<Schemas["ExecutionStatus"], ExecutionStatus>>,
  Verified<SameSet<Schemas["RunMode"], RunMode>>,
  Verified<SameSet<Schemas["CompileStatus"], CompileStatus>>,
  Verified<SameSet<Schemas["IndexStatus"], IndexStatus>>,
  Verified<SameSet<Schemas["WaitKind"], WaitKind>>,
  Verified<SameSet<Schemas["WaitState"], WaitState>>,
  Verified<SameSet<Schemas["OnTimeoutAction"], OnTimeoutAction>>,
  Verified<SameSet<Schemas["ApprovalDecision"], ApprovalDecision>>,
  Verified<SameSet<Schemas["ItemRecoveryDecision"], ItemRecoveryDecision>>,
  Verified<SameSet<Schemas["TypeKind"], TypeKind>>,
  Verified<SameSet<Schemas["Severity"], Severity>>,
  Verified<SameSet<Schemas["LineageRelation"], LineageRelation>>,
  Verified<SameSet<Schemas["SpecOrigin"], SpecOrigin>>,
  Verified<SameSet<Schemas["SettingScope"], SettingScope>>,
  Verified<SameSet<Schemas["Modality"], Modality>>,
  Verified<SameSet<Schemas["ModelFamily"], ModelFamily>>,
  Verified<SameNumbers<Schemas["PromptLevel-Input"], PromptLevel>>,
]
