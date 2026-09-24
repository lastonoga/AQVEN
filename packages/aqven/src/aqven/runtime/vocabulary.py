from typing import Final, Literal, get_args

type RunStatus = Literal["queued", "running", "suspended", "completed", "failed", "cancelled"]
type TerminalRunStatus = Literal["completed", "failed", "cancelled"]
type RunMode = Literal["live", "replay", "experiment", "dryrun"]
type ExecutionStatus = Literal["pending", "running", "ok", "failed", "skipped", "suspended", "cancelled"]
type FinishedExecutionStatus = Literal["ok", "failed", "skipped", "cancelled"]
type WaitKind = Literal["form", "tool_approval"]
type WaitState = Literal["waiting", "resolved", "timed_out"]
type OnTimeoutAction = Literal["fail", "default", "escalate"]
type ItemRecoveryDecision = Literal["skip", "default"]
type ResumeOutcome = Literal["accepted", "replayed", "sent"]
type IncludePayloads = Literal["none", "truncated", "full"]
type AttemptCauseKind = Literal[
    "rate_limited",
    "schema_invalid",
    "truncated",
    "refusal",
    "provider_error",
    "budget_exceeded",
    "cassette_miss",
    "invalid_json",
    "no_structured_output",
    "feature_unsupported",
]
type AttemptAction = Literal["retry", "repair", "fallback", "none"]
type CallOutcome = Literal["ok", "refusal", "truncated", "error"]
type AbandonedOutcome = Literal["refusal", "truncated", "error"]
type CostSource = Literal["provider", "prices", "genai", "unknown"]
type LineageRelation = Literal["fork", "replay"]
type SpecOrigin = Literal["working_copy", "release"]
type ForkBase = Literal["original", "working"]
type PromptSource = Literal["disk", "draft"]
type PromptPartKind = Literal["text", "image", "audio", "video", "document"]
type PromptRole = Literal["system", "user", "assistant", "tool"]
type ResolvedOutputMode = Literal["tool", "native", "prompted"]
type ModelOutputErrorCode = Literal[
    "MODEL_NO_STRUCTURED_OUTPUT",
    "MODEL_INVALID_JSON",
    "MODEL_SCHEMA_MISMATCH",
    "MODEL_FEATURE_UNSUPPORTED",
    "MODEL_RETRIES_EXHAUSTED",
    "OUTPUT_SCHEMA_REJECTED",
]

MODEL_OUTPUT_ERROR_CODES: Final[frozenset[str]] = frozenset(get_args(ModelOutputErrorCode.__value__))
