import { useTranslations } from "use-intl"
import type { RunId, RunSummary } from "@/domain"
import type { MatrixField } from "@/components/studio"
import { useRelativeTime } from "@/i18n/format"
import { runRef } from "@/lib/format"
import { runFields } from "./run-fields"

export function useRunFields(currentRunId: RunId | null): readonly MatrixField<RunSummary>[] {
  const t = useTranslations()
  const when = useRelativeTime("long")
  return runFields({
    label: (column) => t(`schema.runs.columns.${column}`),
    currentRunId,
    status: (status) => t(`domain.outcome.${status}`),
    origin: (origin) => (origin.kind === "fork" ? t("schema.runs.origin.fork", { run: runRef(origin.of) }) : t("schema.runs.origin.baseline")),
    when,
  })
}
