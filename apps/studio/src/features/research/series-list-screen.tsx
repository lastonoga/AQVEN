import { useFormatter, useTranslations } from "use-intl"
import type { FlowId, SeriesSummary } from "@/domain"
import { Empty, Heading, Matrix, Page, RowLink, Surface, Tag, Text, type MatrixField } from "@/components/studio"
import { usd } from "@/lib/format"
import { projectRouteApi, ROUTE_PATH, seriesListRouteApi } from "@/lib/routes"
import { seriesRef, sizeText, STARTED_FORMAT } from "./presenters"
import { originText, seriesListOrder } from "./series-list"
import { SERIES_STATUS_TONE, VERDICT_TONE } from "./tones"

const LIST_MIN_WIDTH = 860

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

function useListFields(): readonly MatrixField<SeriesSummary>[] {
  const t = useTranslations("research")
  const format = useFormatter()
  const look = (flow: string) => t("seriesList.look", { flow })
  return [
    {
      id: "status",
      label: t("seriesList.column.status"),
      track: "minmax(150px,0.8fr)",
      render: (series) => (
        <Tag size="xs" tone={SERIES_STATUS_TONE[series.status]}>
          {t(`vocabulary.status.${series.status}`)}
        </Tag>
      ),
    },
    {
      id: "experiment",
      label: t("seriesList.column.experiment"),
      track: "minmax(200px,1.6fr)",
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
      id: "on",
      label: t("seriesList.column.on"),
      track: "88px",
      render: (series) => (
        <Tag size="xs" tone="neutral" fill="outline">
          {t(`vocabulary.splitShort.${series.on}`)}
        </Tag>
      ),
    },
    { id: "size", label: t("seriesList.column.size"), track: "72px", render: (series) => <Text role="cell">{sizeText(series.cases, series.repeats)}</Text> },
    { id: "spend", label: t("seriesList.column.spend"), track: "80px", align: "end", render: (series) => <Text role="cell">{usd(series.spend.usd)}</Text> },
    { id: "verdict", label: t("seriesList.column.verdict"), track: "minmax(120px,0.8fr)", render: (series) => <VerdictCell series={series} /> },
    {
      id: "started",
      label: t("seriesList.column.started"),
      track: "minmax(130px,0.8fr)",
      render: (series) => <Text role="cell">{format.dateTime(new Date(series.startedAt), STARTED_FORMAT)}</Text>,
    },
  ]
}

function SeriesTable({ series, flow }: { readonly series: readonly SeriesSummary[]; readonly flow: FlowId | null }) {
  const t = useTranslations("research.seriesList")
  const fields = useListFields()
  if (series.length === 0) return <Empty title={flow === null ? t("empty") : t("emptyFlow", { flow })} hint={t("emptyHint")} />
  return (
    <Surface variant="panel" className="overflow-x-auto">
      <Matrix
        orientation="rows"
        rules="rows"
        label={t("aria")}
        minWidth={LIST_MIN_WIDTH}
        items={series}
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
  const { series, flow } = seriesListRouteApi.useLoaderData()
  const subtitle = flow === null ? t("subtitle", { project: project.package ?? project.root }) : t("subtitleFlow", { flow })
  return (
    <Page width="xl" header={<Heading size="page" title={t("title")} below={[subtitle]} />}>
      <SeriesTable series={seriesListOrder(series)} flow={flow} />
    </Page>
  )
}
