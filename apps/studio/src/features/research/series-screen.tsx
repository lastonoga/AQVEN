import { Page } from "@/components/studio"
import { WaitsInline } from "@/features/review"
import { seriesRouteApi } from "@/lib/routes"
import { MetricMatrix } from "./metric-matrix"
import { SeriesCases } from "./series-cases"
import { SeriesHeader, SeriesVerdictBlock } from "./series-header"
import { useSeriesLive } from "./use-series-live"

export function SeriesScreen() {
  const { series, cases, filter } = seriesRouteApi.useLoaderData()
  const { following } = useSeriesLive(series)
  return (
    <Page width="xl" header={<SeriesHeader series={series} live={following} />}>
      <div className="flex min-w-0 flex-col gap-7">
        <SeriesVerdictBlock series={series} />
        <MetricMatrix series={series} />
        {series.waits > 0 ? <WaitsInline key={series.waits} seriesId={series.id} flowId={series.flow} /> : null}
        <SeriesCases series={series} cases={cases} filter={filter} />
      </div>
    </Page>
  )
}
