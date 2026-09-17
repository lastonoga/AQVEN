import type { CallId, CallSheetTab, DataflowRun } from "@/domain"
import { Marker } from "@/components/studio"
import { StageTimeline } from "@/features/trace"
import { useOpenPaths } from "@/lib/search"
import { RunMetricCards } from "./run-metrics"
import { RunOutcomeCard } from "./run-outcome"

export type RunViewProps = {
  readonly dataflow: DataflowRun
  readonly onOpenCall: (callId: CallId, tab: CallSheetTab) => void
}

export function RunView({ dataflow, onOpenCall }: RunViewProps) {
  const open = useOpenPaths(dataflow.defaultOpen)
  return (
    <>
      <RunMetricCards metrics={dataflow.metrics} />
      <StageTimeline
        stages={dataflow.stages}
        variant="run"
        open={open}
        onOpenCall={onOpenCall}
        end={{ marker: <Marker shape="end" tone="neutral" />, content: <RunOutcomeCard outcome={dataflow.outcome} /> }}
      />
    </>
  )
}
