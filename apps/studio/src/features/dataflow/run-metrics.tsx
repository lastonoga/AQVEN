import { useTranslations } from "use-intl"
import type { RunMetrics } from "@/domain"
import { Stat, Surface } from "@/components/studio"
import { metricCards } from "./metrics"

export type RunMetricCardsProps = { readonly metrics: RunMetrics }

export function RunMetricCards({ metrics }: RunMetricCardsProps) {
  const t = useTranslations("dataflow")
  return (
    <div className="mb-3.5 grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-2.5">
      {metricCards(metrics, t).map((card) => (
        <Surface key={card.id} variant="raised" padding="md">
          <Stat variant="metric" label={card.label} badge={card.badge} value={card.value} note={card.note} hint={card.hint} />
        </Surface>
      ))}
    </div>
  )
}
