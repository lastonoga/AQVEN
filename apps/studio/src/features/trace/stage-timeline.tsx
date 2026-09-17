import type { ReactNode } from "react"
import { useTranslations } from "use-intl"
import type { CallId, CallSheetTab, StageRun } from "@/domain"
import { Marker, STAGE_KIND, Timeline, type TimelineItem } from "@/components/studio"
import type { OpenPaths } from "@/lib/search"
import type { TraceScope, TraceVariant } from "./context"
import { StageCard } from "./stage-card"

export type StageTimelineProps = {
  readonly stages: readonly StageRun[]
  readonly variant: TraceVariant
  readonly open: OpenPaths
  readonly onOpenCall: (callId: CallId, tab: CallSheetTab) => void
  readonly end?: { readonly marker: ReactNode; readonly content: ReactNode }
}

function StageMarker({ stage }: { readonly stage: StageRun }) {
  const spec = STAGE_KIND[stage.kind]
  return (
    <Marker shape={spec.marker} tone={spec.tone}>
      {spec.glyph ?? stage.ordinal}
    </Marker>
  )
}

export function StageTimeline({ stages, variant, open, onOpenCall, end }: StageTimelineProps) {
  const t = useTranslations()
  const scope: TraceScope = { t, variant, open, onOpenCall }
  const items: readonly TimelineItem[] = stages.map((stage) => ({
    id: `stage-${stage.id}`,
    marker: <StageMarker stage={stage} />,
    content: <StageCard stage={stage} scope={scope} />,
  }))
  return <Timeline items={items} {...(end === undefined ? {} : { end })} />
}
