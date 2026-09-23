import type { ExperimentDetail, LaunchEstimate, LaunchRequest, SeriesSummary } from "@/domain"
import { Page } from "@/components/studio"
import { experimentRouteApi } from "@/lib/routes"
import { ExperimentAnswer } from "./experiment-answer"
import { ExperimentCanvas } from "./experiment-canvas"
import { ExperimentComparison } from "./experiment-comparison"
import { ExperimentDetails } from "./experiment-details"
import { ExperimentDisagreements } from "./experiment-disagreements"
import { ExperimentQuestion } from "./experiment-question"
import { LaunchPanel } from "./launch-panel"
import { activeSeries } from "./presenters"
import { SeriesHistory } from "./series-history"
import { useLaunch } from "./use-launch"
import { useSeriesLive } from "./use-series-live"

type ExperimentPageProps = {
  readonly experiment: ExperimentDetail
  readonly series: readonly SeriesSummary[]
  readonly initial: LaunchRequest
  readonly estimate: LaunchEstimate | null
}

function ExperimentPage({ experiment, series, initial, estimate }: ExperimentPageProps) {
  const { graphs, latest } = experimentRouteApi.useLoaderData()
  const launch = useLaunch(experiment, initial, estimate)
  const detail = latest?.series ?? null
  return (
    <Page width="xl" header={<ExperimentQuestion experiment={experiment} latest={series[0] ?? null} launch={launch} />}>
      <div className="flex min-w-0 flex-col gap-7">
        <ExperimentCanvas experiment={experiment} graphs={graphs} />
        <ExperimentAnswer experiment={experiment} latest={detail} launch={launch} />
        <ExperimentComparison latest={detail} />
        <ExperimentDisagreements latest={detail} cases={latest?.disagreements ?? []} />
        <LaunchPanel experiment={experiment} series={series} launch={launch} />
        <SeriesHistory series={series} />
        <ExperimentDetails experiment={experiment} />
      </div>
    </Page>
  )
}

export function ExperimentScreen() {
  const { experiment, series, launch, estimate } = experimentRouteApi.useLoaderData()
  useSeriesLive(activeSeries(series))
  return <ExperimentPage key={experiment.id} experiment={experiment} series={series} initial={launch} estimate={estimate} />
}
