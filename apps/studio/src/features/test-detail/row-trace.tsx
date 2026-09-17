import { useTranslations } from "use-intl"
import type { CallId, CallSheetTab, RowTrace } from "@/domain"
import { Empty, Marker } from "@/components/studio"
import { StageTimeline } from "@/features/trace"
import { CLOSED_PATHS } from "@/lib/search"
import { RowOutcomeCard } from "./row-outcome"

export type RowTraceViewProps = {
  readonly trace: RowTrace | null
  readonly onOpenCall: (callId: CallId, tab: CallSheetTab) => void
}

export function RowTraceView({ trace, onOpenCall }: RowTraceViewProps) {
  const t = useTranslations("common.empty")
  if (trace === null) return <Empty title={t("trace")} />
  return (
    <StageTimeline
      stages={trace.steps}
      variant="trace"
      open={CLOSED_PATHS}
      onOpenCall={onOpenCall}
      end={{ marker: <Marker shape="end" tone="neutral" />, content: <RowOutcomeCard rowId={trace.rowId} outcome={trace.outcome} /> }}
    />
  )
}
