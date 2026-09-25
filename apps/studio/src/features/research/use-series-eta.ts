import { useFormatter, useTranslations } from "use-intl"
import type { SeriesEta } from "@/domain"
import { joinMeta } from "@/lib/format"
import { finishFormat, rateDigits, timeLeft } from "./series-presenters"

export type SeriesEtaCopy = {
  readonly caption: (eta: SeriesEta | null) => string | null
  readonly left: (eta: SeriesEta | null) => string | null
}

export const useSeriesEta = (): SeriesEtaCopy => {
  const t = useTranslations("research.series.eta")
  const format = useFormatter()
  const leftOf = (remainingSeconds: number): string => {
    const left = timeLeft(remainingSeconds)
    return t(left.key, { hours: left.hours, minutes: left.minutes })
  }
  const caption = (eta: SeriesEta | null): string | null => {
    if (eta === null) return null
    if (eta.state === "estimating") return t("estimating")
    if (eta.state === "paused") return t("paused")
    const finish = format.dateTime(new Date(eta.finishAt), finishFormat(eta.remainingSeconds))
    const rate = format.number(eta.attemptsPerMinute, { maximumFractionDigits: rateDigits(eta.attemptsPerMinute) })
    return joinMeta([leftOf(eta.remainingSeconds), t("finishes", { time: finish }), t("speed", { rate })])
  }
  const left = (eta: SeriesEta | null): string | null => (eta?.state === "running" ? leftOf(eta.remainingSeconds) : null)
  return { caption, left }
}
