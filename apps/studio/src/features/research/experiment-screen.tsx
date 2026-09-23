import { Page } from "@/components/studio"
import { experimentRouteApi } from "@/lib/routes"
import { ExperimentHeader } from "./experiment-header"
import { ExperimentMeasure } from "./experiment-measure"
import { ExperimentRun } from "./experiment-run"
import { LaunchPanel } from "./launch-panel"
import { SeriesHistory } from "./series-history"

export function ExperimentScreen() {
  const { experiment, series, launch, estimate } = experimentRouteApi.useLoaderData()
  return (
    <Page width="xl" header={<ExperimentHeader experiment={experiment} />}>
      <div className="flex min-w-0 flex-col gap-7">
        <ExperimentRun experiment={experiment} />
        <ExperimentMeasure experiment={experiment} />
        <LaunchPanel key={experiment.id} experiment={experiment} series={series} launch={launch} estimate={estimate} />
        <SeriesHistory series={series} />
      </div>
    </Page>
  )
}
