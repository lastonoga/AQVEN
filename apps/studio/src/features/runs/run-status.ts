import { useTranslations } from "use-intl"
import type { ApiNodeCounts, RunStatus } from "@/domain"
import { RUN_STATUS_TONE, type Tone } from "@/components/studio"

export type RunStatusLook =
  | { readonly kind: "plain"; readonly status: RunStatus; readonly tone: Tone }
  | { readonly kind: "partial"; readonly failed: number; readonly tone: Tone }

const PARTIAL_TONE: Tone = "warning"

const absorbedFailures = (status: RunStatus, counts: ApiNodeCounts): number => (status === "completed" ? counts.failed : 0)

export const runStatusLook = (status: RunStatus, counts: ApiNodeCounts): RunStatusLook => {
  const failed = absorbedFailures(status, counts)
  if (failed > 0) return { kind: "partial", failed, tone: PARTIAL_TONE }
  return { kind: "plain", status, tone: RUN_STATUS_TONE[status] }
}

export const useRunStatusText = (): ((look: RunStatusLook) => string) => {
  const status = useTranslations("domain.runStatus")
  const t = useTranslations("runs.status")
  return (look) => (look.kind === "partial" ? t("completedWithFailures", { count: look.failed }) : status(look.status))
}
