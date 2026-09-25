import { useFormatter, useTranslations } from "use-intl"
import type { SeriesSummary } from "@/domain"
import { Empty, Heading, Matrix, Page, RowLink, Surface, Tag, Text, type MatrixField } from "@/components/studio"
import { usd } from "@/lib/format"
import { projectRouteApi, ROUTE_PATH, seriesListRouteApi } from "@/lib/routes"
import { useFlowTitle } from "./copy"
import { seriesRef, sizeText, STARTED_FORMAT } from "./presenters"
import { originText, seriesListOrder } from "./series-list"
import { SERIES_STATUS_TONE, VERDICT_TONE } from "./tones"
import { useSeriesEta } from "./use-series-eta"

const LIST_MIN_WIDTH = 920

function VerdictCell({ series }: { readonly series: SeriesSummary }) {
  const t = useTranslations("research.vocabulary.verdict")
  if (series.verdict === null) {
    return (
      <Text role="cell" tone="neutral">
        —
      </Text>
    )
  }
  return (
    <Tag size="xs" tone={VERDICT_TONE[series.verdict.state]}>
      {t(series.verdict.state)}
    </Tag>
  )
}

function StatusCell({ series, left }: { readonly series: SeriesSummary; readonly left: string | null }) {
  const t = useTranslations("research.vocabulary.status")
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Tag size="xs" tone={SERIES_STATUS_TONE[series.status]}>
        {t(series.status)}
      </Tag>
      {left === null ? null : (
        <Text role="small" tone="neutral" truncate>
          {left}
        </Text>
      )}
    </div>
  )
}

function useListFields(): readonly MatrixField<SeriesSummary>[] {
  const t = useTranslations("research")
  const format = useFormatter()
  const flowTitle = useFlowTitle()
  const eta = useSeriesEta()
  const look = (flow: string) => t("seriesList.look", { flow })
  return [
    {
      id: "status",
      label: t("seriesList.column.status"),
      track: "minmax(190px,0.9fr)",
      render: (series) => <StatusCell series={series} left={eta.left(series.eta)} />,
    },
    {
      id: "experiment",
      label: t("seriesList.column.experiment"),
      track: "minmax(180px,1.6fr)",
      render: (series) => (
        <div className="flex min-w-0 items-baseline gap-2">
          <Text role="cell" tone="default" weight="semibold" truncate>
            {originText(series.origin, { look })}
          </Text>
          <Text role="small" tone="neutral">
            {seriesRef(series.id)}
          </Text>
        </div>
      ),
    },
    {
      id: "flow",
      label: t("seriesList.column.flow"),
      track: "minmax(120px,1fr)",
      render: (series) => (
        <Text role="cell" as="div" truncate title={flowTitle(series.flow)}>
          {flowTitle(series.flow)}
        </Text>
      ),
    },
    {
      id: "on",
      label: t("seriesList.column.on"),
      track: "80px",
      render: (series) => (
        <Tag size="xs" tone="neutral" fill="outline">
          {t(`vocabulary.splitShort.${series.on}`)}
        </Tag>
      ),
    },
    { id: "size", label: t("seriesList.column.size"), track: "72px", render: (series) => <Text role="cell">{sizeText(series.cases, series.repeats)}</Text> },
    { id: "spend", label: t("seriesList.column.spend"), track: "80px", align: "end", render: (series) => <Text role="cell">{usd(series.spend.usd)}</Text> },
    { id: "verdict", label: t("seriesList.column.verdict"), track: "minmax(110px,0.8fr)", render: (series) => <VerdictCell series={series} /> },
    {
      id: "started",
      label: t("seriesList.column.started"),
      track: "minmax(120px,0.8fr)",
      render: (series) => <Text role="cell">{format.dateTime(new Date(series.startedAt), STARTED_FORMAT)}</Text>,
    },
  ]
}

function SeriesTable({ series }: { readonly series: readonly SeriesSummary[] }) {
  const t = useTranslations("research.seriesList")
  const fields = useListFields()
  if (series.length === 0) return <Empty title={t("empty")} hint={t("emptyHint")} />
  return (
    <Surface variant="panel" className="overflow-x-auto">
      <Matrix
        orientation="rows"
        rules="rows"
        label={t("aria")}
        minWidth={LIST_MIN_WIDTH}
        items={seriesListOrder(series)}
        itemKey={(item) => item.id}
        fields={fields}
        rowLink={(item) => <RowLink to={ROUTE_PATH.series} params={{ seriesId: item.id }} aria-label={t("open", { ref: seriesRef(item.id) })} />}
      />
    </Surface>
  )
}

export function SeriesListScreen() {
  const t = useTranslations("research.seriesList")
  const { project } = projectRouteApi.useLoaderData()
  const { series } = seriesListRouteApi.useLoaderData()
  return (
    <Page width="xl" header={<Heading size="page" title={t("title")} below={[t("subtitle", { project: project.package ?? project.root })]} />}>
      <SeriesTable series={series} />
    </Page>
  )
}
