import { useTranslations } from "use-intl"
import type { ApiNodeCounts, RunStatus } from "@/domain"
import { RUN_STATUS_TONE, type Tone } from "@/components/studio"
import type { RecoveredDecision } from "./node-failures"

export type RunStatusLook =
  | { readonly kind: "plain"; readonly status: RunStatus; readonly tone: Tone }
  | { readonly kind: "partial"; readonly failed: number; readonly tone: Tone }
  | { readonly kind: "recovered"; readonly count: number; readonly decision: RecoveredDecision; readonly tone: Tone }

type LookKind = RunStatusLook["kind"]
type LookOf<K extends LookKind> = Extract<RunStatusLook, { kind: K }>
type StatusCopy = {
  readonly status: (status: RunStatus) => string
  readonly partial: (count: number) => string
  readonly recovered: (decision: RecoveredDecision, count: number) => string
}
type LookText<K extends LookKind> = (look: LookOf<K>, copy: StatusCopy) => string

const PARTIAL_TONE: Tone = "warning"

const LOOK_TEXT: { readonly [K in LookKind]: LookText<K> } = {
  plain: (look, copy) => copy.status(look.status),
  partial: (look, copy) => copy.partial(look.failed),
  recovered: (look, copy) => copy.recovered(look.decision, look.count),
}

const absorbedFailures = (status: RunStatus, counts: ApiNodeCounts): number => (status === "completed" ? counts.failed : 0)

const recoveredDecision = (counts: ApiNodeCounts): RecoveredDecision => {
  if (counts.items_skipped === 0) return "default"
  if (counts.items_replaced === 0) return "skip"
  return "mixed"
}

export const runStatusLook = (status: RunStatus, counts: ApiNodeCounts): RunStatusLook => {
  const failed = absorbedFailures(status, counts)
  const recovered = counts.items_replaced + counts.items_skipped
  if (failed === 0) return { kind: "plain", status, tone: RUN_STATUS_TONE[status] }
  if (failed !== recovered) return { kind: "partial", failed, tone: PARTIAL_TONE }
  return { kind: "recovered", count: recovered, decision: recoveredDecision(counts), tone: PARTIAL_TONE }
}

const lookText = <K extends LookKind>(look: LookOf<K>, copy: StatusCopy): string => {
  const text: LookText<K> = LOOK_TEXT[look.kind]
  return text(look, copy)
}

export const useRunStatusText = (): ((look: RunStatusLook) => string) => {
  const status = useTranslations("domain.runStatus")
  const t = useTranslations("runs.status")
  const copy: StatusCopy = {
    status: (value) => status(value),
    partial: (count) => t("completedWithFailures", { count }),
    recovered: (decision, count) => t(`completedWithRecovered.${decision}`, { count }),
  }
  return (look) => lookText(look, copy)
}
