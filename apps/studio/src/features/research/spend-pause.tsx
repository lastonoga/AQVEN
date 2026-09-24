import { useId, useState } from "react"
import { Play, Square } from "lucide-react"
import { useTranslations } from "use-intl"
import { Actions, Text, type ActionSpec } from "@/components/studio"
import { Input } from "@/components/ui/input"
import { usd } from "@/lib/format"
import { continuedCap, isSpendPause, nextCapDraft, type PausedSeries } from "./series-presenters"
import type { ResearchAction } from "./use-research-action"

const CAP_STEP = "0.01"

type SpendPauseProps = { readonly series: PausedSeries; readonly action: ResearchAction }

function PauseLine({ series, action }: SpendPauseProps) {
  const t = useTranslations("research.pause")
  const id = useId()
  const [draft, setDraft] = useState(() => nextCapDraft(series.spend.capUsd))
  const cap = continuedCap(draft, series.spend.capUsd)
  const spent = series.pause?.spentUsd ?? series.spend.usd
  const actions: readonly ActionSpec[] = [
    {
      id: "continue",
      label: t("continue"),
      variant: "default",
      icon: Play,
      disabled: cap === null,
      pending: action.pending("continue"),
      onClick: () => {
        if (cap === null) return
        action.run("continue", (api) => api.approveSeries(series.id, cap))
      },
    },
    { id: "stop", label: t("stop"), variant: "outline-destructive", icon: Square, pending: action.pending("stop"), onClick: () => { action.run("stop", (api) => api.cancelSeries(series.id)) } },
  ]
  const input = () => (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      min={0}
      step={CAP_STEP}
      aria-label={t("capAria")}
      aria-invalid={cap === null}
      value={draft}
      className="mx-1 inline-block h-7 w-24"
      onChange={(event) => {
        setDraft(event.target.value)
      }}
    />
  )
  return (
    <div role="group" aria-label={t("aria")} className="flex w-full min-w-0 flex-wrap items-center gap-2">
      <Text as="p" role="meta" tone="warning" className="min-w-0">
        {t("spent", { spent: usd(spent), cap: usd(series.spend.capUsd) })} {t.rich("continueUpTo", { cap: input })}
      </Text>
      <Actions actions={actions} />
    </div>
  )
}

export function SpendPause({ series, action }: SpendPauseProps) {
  if (!isSpendPause(series)) return null
  return <PauseLine key={series.spend.capUsd} series={series} action={action} />
}
