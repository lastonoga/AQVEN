import { useTranslations } from "use-intl"
import type { ApiExecutionAddress } from "@/domain"
import { coordinateOf } from "@/features/trace"
import { SEPARATOR } from "@/lib/format"

export const TITLED_ERROR_CODES = [
  "OUTPUT_SCHEMA_REJECTED",
  "MODEL_RETRIES_EXHAUSTED",
  "MODEL_NO_STRUCTURED_OUTPUT",
  "MODEL_INVALID_JSON",
  "MODEL_SCHEMA_MISMATCH",
  "MODEL_FEATURE_UNSUPPORTED",
  "MODEL_STREAM_STALLED",
  "provider_error",
  "provider_key_missing",
  "timeout",
  "budget_exceeded",
  "refusal",
  "truncated",
  "output_invalid",
  "check_failed",
  "input_invalid",
  "prompt_invalid",
  "allowed_set_invalid",
  "media_unavailable",
  "code_invalid",
  "approval_missing",
  "tool_unknown",
  "cassette_miss",
  "AMBIGUOUS_REPLAY",
  "HUMAN_TIMED_OUT",
  "HUMAN_DEFAULT_INVALID",
  "E_MAP_ITEM_FAILED",
  "E_MAP_OVER_NOT_LIST",
  "E_JOIN_FAILED",
  "E_JOIN_UNDECIDED",
  "E_INPUT_OVERLAY_UNSUPPORTED",
  "E_CHILD_SKIPPED",
  "E_CHILD_CANCELLED",
  "NODE_ERROR",
  "IO_INVALID",
  "REF_UNRESOLVED",
  "CODE_NOT_FOUND",
  "CODE_SIGNATURE",
  "TOOL_REPLAY_MISS",
  "SECRET_MISSING",
  "TOOL_JOB_FAILED",
  "TOOL_JOB_TIMEOUT",
  "BLOB_MISSING",
  "PLAN_MISSING",
  "PLAN_LOOKUP",
  "EXECUTOR_MISSING",
  "RUN_TIMED_OUT",
  "INPUT_INVALID",
  "INTERNAL",
] as const

export type TitledErrorCode = (typeof TITLED_ERROR_CODES)[number]

export type ErrorScope = "step" | "run"

const TITLED: ReadonlySet<string> = new Set<string>(TITLED_ERROR_CODES)

export const isTitledCode = (code: string): code is TitledErrorCode => TITLED.has(code)

export const useErrorTitle = (): ((code: string | null, scope: ErrorScope) => string) => {
  const title = useTranslations("runs.failure.title")
  const fallback = useTranslations("runs.failure.fallback")
  return (code, scope) => (code !== null && isTitledCode(code) ? title(code) : fallback(scope))
}

export const useStepLabel = (): ((address: ApiExecutionAddress) => string) => {
  const t = useTranslations("runs.execution")
  return (address) => {
    const coordinate = coordinateOf(address)
    if (coordinate === null) return address.node_id
    return `${address.node_id}${SEPARATOR}${t(coordinate.kind, { value: coordinate.value })}`
  }
}
