import { createFileRoute } from "@tanstack/react-router"
import * as ids from "@/data/ids"
import { ExperimentScreen, planLaunch } from "@/features/research"
import { orNotFound } from "@/routes/-api-error"
import { loadGraphs, loadLatest } from "@/routes/-experiment-load"

export const Route = createFileRoute("/_project/research/experiments/$experimentId")({
  params: {
    parse: ({ experimentId }) => ({ experimentId: ids.experimentId(experimentId) }),
    stringify: ({ experimentId }) => ({ experimentId }),
  },
  loader: async ({ context: { api }, params }) => {
    const experiment = await orNotFound(api.research.experiment(params.experimentId))
    const launch = planLaunch(experiment)
    const [series, plan, graphs] = await Promise.all([
      api.research.seriesOfExperiment(params.experimentId),
      launch.cases < 1 ? null : api.research.launchPlan(params.experimentId, launch).catch(() => null),
      loadGraphs(api, experiment),
    ])
    const latest = await loadLatest(api, series).catch(() => null)
    return { experiment, series, launch, plan, graphs, latest }
  },
  component: ExperimentScreen,
})
