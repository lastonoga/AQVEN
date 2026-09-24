import { Link } from "@tanstack/react-router"
import { useFormatter, useTranslations } from "use-intl"
import type { SeriesSummary } from "@/domain"
import { Surface, Tag, Text } from "@/components/studio"
import { joinMeta, usd } from "@/lib/format"
import { ROUTE_PATH } from "@/lib/routes"
import { ResearchSection } from "./layout"
import { seriesRef, sizeText, STARTED_FORMAT } from "./presenters"
import { isLowerBound, unpricedSpend } from "./series-presenters"
import { SERIES_STATUS_TONE, VERDICT_TONE } from "./tones"

function SeriesLine({ series }: { readonly series: SeriesSummary }) {
  const t = useTranslations("research")
  const format = useFormatter()
  const ref = seriesRef(series.id)
  const spend = isLowerBound(series.spend) ? t("experiment.history.lowerBound", { usd: usd(series.spend.usd) }) : usd(series.spend.usd)
  return (
    <li>
      <Link
        to={ROUTE_PATH.series}
        params={{ seriesId: series.id }}
        aria-label={t("experiment.history.open", { ref })}
        className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-muted/60"
      >
        <Text role="cell" tone="default" weight="semibold">
          {format.dateTime(new Date(series.startedAt), STARTED_FORMAT)}
        </Text>
        <Text role="data" tone="neutral">
          {joinMeta([ref, t(`vocabulary.splitShort.${series.on}`), sizeText(series.cases, series.repeats), spend])}
        </Text>
        <span className="ml-auto flex items-center gap-1.5">
          <Tag size="xs" tone={SERIES_STATUS_TONE[series.status]}>
            {t(`vocabulary.status.${series.status}`)}
          </Tag>
          {series.verdict === null ? null : (
            <Tag size="xs" tone={VERDICT_TONE[series.verdict.state]}>
              {t(`vocabulary.verdict.${series.verdict.state}`)}
            </Tag>
          )}
        </span>
      </Link>
    </li>
  )
}

function UnpricedNote({ series }: { readonly series: readonly SeriesSummary[] }) {
  const t = useTranslations("research.experiment.history")
  const unpriced = unpricedSpend(series)
  if (unpriced.attempts === 0) return null
  return (
    <Text as="p" role="hint" tone="warning">
      {t("unpriced", { count: unpriced.attempts, series: unpriced.series })}
    </Text>
  )
}

export function SeriesHistory({ series }: { readonly series: readonly SeriesSummary[] }) {
  const t = useTranslations("research.experiment.history")
  if (series.length === 0) return null
  return (
    <ResearchSection title={t("title")}>
      <Surface variant="panel">
        <ul aria-label={t("aria")} className="divide-y divide-border">
          {series.map((item) => (
            <SeriesLine key={item.id} series={item} />
          ))}
        </ul>
      </Surface>
      <UnpricedNote series={series} />
    </ResearchSection>
  )
}
