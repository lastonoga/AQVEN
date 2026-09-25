import type { ExperimentDetail, LaunchPlan, LaunchRequest, SeriesSummary } from "@/domain"
import { Page } from "@/components/studio"
import { experimentRouteApi } from "@/lib/routes"
import { ExperimentAnswer } from "./experiment-answer"
import { ExperimentCanvas } from "./experiment-canvas"
import { ExperimentComparison } from "./experiment-comparison"
import { ExperimentDetails } from "./experiment-details"
import { ExperimentDisagreements } from "./experiment-disagreements"
import { ExperimentQuestion } from "./experiment-question"
import { graphViews, selectedFacts, type GraphView, type StepSelection } from "./graph-model"
import { LaunchPanel } from "./launch-panel"
import { SeriesHistory } from "./series-history"
import { StepInspector } from "./step-inspector"
import { useLaunch } from "./use-launch"
import { usePageFocus } from "./use-page-focus"
import { changeBlocks } from "./what-changes"

type ExperimentPageProps = {
  readonly experiment: ExperimentDetail
  readonly series: readonly SeriesSummary[]
  readonly initial: LaunchRequest
  readonly plan: LaunchPlan | null
}

type StepSlotProps = {
  readonly experiment: ExperimentDetail
  readonly views: readonly GraphView[]
  readonly selection: StepSelection | null
  readonly latest: SeriesSummary | null
  readonly onClose: () => void
}

function StepSlot({ experiment, views, selection, latest, onClose }: StepSlotProps) {
  const facts = selectedFacts(experiment, views, selection)
  if (facts === null || selection === null) return null
  return <StepInspector key={`${selection.graph}/${selection.node}`} facts={facts} latest={latest} onClose={onClose} />
}

function ExperimentPage({ experiment, series, initial, plan }: ExperimentPageProps) {
  const { graphs, latest } = experimentRouteApi.useLoaderData()
  const launch = useLaunch(experiment, initial, plan)
  const views = graphViews(experiment, graphs)
  const blocks = changeBlocks(experiment)
  const focus = usePageFocus(views, blocks)
  const detail = latest?.series ?? null
  return (
    <div className="relative h-full min-h-0">
      <Page width="xl" header={<ExperimentQuestion experiment={experiment} latest={series[0] ?? null} launch={launch} />}>
        <div className="flex min-w-0 flex-col gap-7">
          <ExperimentCanvas experiment={experiment} views={views} blocks={blocks} focus={focus} />
          <ExperimentAnswer experiment={experiment} latest={detail} launch={launch} />
          <ExperimentComparison latest={detail} />
          <ExperimentDisagreements latest={detail} cases={latest?.disagreements ?? []} />
          <LaunchPanel experiment={experiment} series={series} launch={launch} />
          <SeriesHistory series={series} />
          <ExperimentDetails experiment={experiment} />
        </div>
      </Page>
      <StepSlot
        experiment={experiment}
        views={views}
        selection={focus.selection}
        latest={series[0] ?? null}
        onClose={focus.close}
      />
    </div>
  )
}

export function ExperimentScreen() {
  const { experiment, series, launch, plan } = experimentRouteApi.useLoaderData()
  return <ExperimentPage key={experiment.id} experiment={experiment} series={series} initial={launch} plan={plan} />
}
