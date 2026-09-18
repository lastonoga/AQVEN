import { useState, type ReactNode } from "react"
import { useTranslations } from "use-intl"
import type { ApiExecutionAddress } from "@/domain"
import { Heading, Marker, Surface, Timeline, type TimelineItem } from "@/components/studio"
import type { OpenPaths, TraceScope } from "./context"
import type { RowKey, StageRun, TraceRun } from "./model"
import { statusTone } from "./paint"
import { StageCard } from "./stage-card"

export type StageTimelineProps = {
  readonly trace: TraceRun
  readonly selected: string | null
  readonly onOpenCall: (address: ApiExecutionAddress, row: RowKey) => void
  readonly end?: { readonly marker: ReactNode; readonly content: ReactNode }
}

const useOpenPaths = (initial: readonly string[]): OpenPaths => {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(initial))
  return {
    isOpen: (path) => open.has(path),
    toggle: (path) => {
      setOpen((current) => {
        const next = new Set(current)
        if (!next.delete(path)) next.add(path)
        return next
      })
    },
  }
}

const defaultOpen = (stages: readonly StageRun[]): readonly string[] =>
  stages.flatMap((stage) => stage.groups.flatMap((group) => group.columns.filter((column) => column.child !== null).map((column) => column.id)))

function StageMarker({ stage }: { readonly stage: StageRun }) {
  return (
    <Marker shape={stage.fanOut === 0 ? "circle" : "diamond"} tone={statusTone(stage.status)}>
      {stage.ordinal}
    </Marker>
  )
}

function PendingCard({ nodeId, label }: { readonly nodeId: string; readonly label: string }) {
  return (
    <Surface variant="well" padding="sm">
      <Heading size="cell" title={nodeId} description={label} />
    </Surface>
  )
}

export function StageTimeline({ trace, selected, onOpenCall, end }: StageTimelineProps) {
  const t = useTranslations()
  const open = useOpenPaths(defaultOpen(trace.stages))
  const scope: TraceScope = { t, open, onOpenCall, selected }
  const items: readonly TimelineItem[] = [
    ...trace.stages.map((stage) => ({
      id: `stage-${stage.id}`,
      marker: <StageMarker stage={stage} />,
      content: <StageCard stage={stage} scope={scope} />,
    })),
    ...trace.pending.map((nodeId) => ({
      id: `pending-${nodeId}`,
      marker: <Marker shape="circle" tone="neutral" />,
      content: <PendingCard nodeId={nodeId} label={t("trace.stage.pending")} />,
    })),
  ]
  return <Timeline items={items} {...(end === undefined ? {} : { end })} />
}
