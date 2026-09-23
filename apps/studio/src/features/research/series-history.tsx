import { useFormatter, useTranslations } from "use-intl"
import type { SeriesSummary } from "@/domain"
import { Empty, Matrix, RowLink, Surface, Tag, Text, type MatrixField } from "@/components/studio"
import { usd } from "@/lib/format"
import { ROUTE_PATH } from "@/lib/routes"
import { ResearchSection } from "./layout"
import { seriesRef, sizeText, STARTED_FORMAT } from "./presenters"
import { isLowerBound, unpricedSpend } from "./series-presenters"
import { SERIES_STATUS_TONE, VERDICT_TONE } from "./tones"

const HISTORY_MIN_WIDTH = 760

function useHistoryFields(): readonly MatrixField<SeriesSummary>[] {
  const t = useTranslations("research")
  const format = useFormatter()
  return [
    {
      id: "started",
      label: t("experiment.history.column.started"),
      track: "minmax(150px,1fr)",
      render: (series) => (
        <div className="flex min-w-0 items-baseline gap-2">
          <Text role="cell" tone="default" weight="semibold">
            {format.dateTime(new Date(series.startedAt), STARTED_FORMAT)}
          </Text>
          <Text role="small" tone="neutral">
            {seriesRef(series.id)}
          </Text>
        </div>
      ),
    },
    {
      id: "split",
      label: t("experiment.history.column.split"),
      track: "88px",
      render: (series) => (
        <Tag size="xs" tone="neutral" fill="outline">
          {t(`vocabulary.splitShort.${series.on}`)}
        </Tag>
      ),
    },
    { id: "size", label: t("experiment.history.column.size"), track: "72px", render: (series) => <Text role="cell">{sizeText(series.cases, series.repeats)}</Text> },
    {
      id: "attempts",
      label: t("experiment.history.column.attempts"),
      track: "140px",
      render: (series) => <Text role="cell">{t("series.progress", { done: series.progress.done, total: series.progress.total })}</Text>,
    },
    {
      id: "spend",
      label: t("experiment.history.column.spend"),
      track: "88px",
      align: "end",
      render: (series) => (
        <Text role="cell">{isLowerBound(series.spend) ? t("experiment.history.lowerBound", { usd: usd(series.spend.usd) }) : usd(series.spend.usd)}</Text>
      ),
    },
    {
      id: "status",
      label: t("experiment.history.column.status"),
      track: "minmax(140px,0.8fr)",
      render: (series) => (
        <Tag size="xs" tone={SERIES_STATUS_TONE[series.status]}>
          {t(`vocabulary.status.${series.status}`)}
        </Tag>
      ),
    },
    {
      id: "verdict",
      label: t("experiment.history.column.verdict"),
      track: "minmax(120px,0.8fr)",
      render: (series) =>
        series.verdict === null ? (
          <Text role="cell" tone="neutral">
            —
          </Text>
        ) : (
          <Tag size="xs" tone={VERDICT_TONE[series.verdict.state]}>
            {t(`vocabulary.verdict.${series.verdict.state}`)}
          </Tag>
        ),
    },
  ]
}

function UnpricedNote({ series }: { readonly series: readonly SeriesSummary[] }) {
  const t = useTranslations("research.experiment.history")
  const unpriced = unpricedSpend(series)
  if (unpriced.attempts === 0) return null
  return (
    <Text as="p" role="hint" tone="warning" className="mt-2">
      {t("unpriced", { count: unpriced.attempts, series: unpriced.series })}
    </Text>
  )
}

export function SeriesHistory({ series }: { readonly series: readonly SeriesSummary[] }) {
  const t = useTranslations("research.experiment.history")
  const fields = useHistoryFields()
  return (
    <ResearchSection title={t("title")}>
      {series.length === 0 ? (
        <Empty title={t("empty")} hint={t("emptyHint")} />
      ) : (
        <>
          <Surface variant="panel" className="overflow-x-auto">
            <Matrix
              orientation="rows"
              rules="rows"
              label={t("aria")}
              minWidth={HISTORY_MIN_WIDTH}
              items={series}
              itemKey={(item) => item.id}
              fields={fields}
              rowLink={(item) => <RowLink to={ROUTE_PATH.series} params={{ seriesId: item.id }} aria-label={t("open", { ref: seriesRef(item.id) })} />}
            />
          </Surface>
          <UnpricedNote series={series} />
        </>
      )}
    </ResearchSection>
  )
}
