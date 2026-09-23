import { createFileRoute } from "@tanstack/react-router"
import * as ids from "@/data/ids"
import { ExperimentScreen, planLaunch } from "@/features/research"
import { orNotFound } from "@/routes/-api-error"

export const Route = createFileRoute("/_project/research/experiments/$experimentId")({
  params: {
    parse: ({ experimentId }) => ({ experimentId: ids.experimentId(experimentId) }),
    stringify: ({ experimentId }) => ({ experimentId }),
  },
  loader: async ({ context: { api }, params }) => {
    const experiment = await orNotFound(api.research.experiment(params.experimentId))
    const launch = planLaunch(experiment)
    const [series, estimate] = await Promise.all([
      api.research.seriesOfExperiment(params.experimentId),
      launch.cases < 1 ? null : api.research.estimate(params.experimentId, launch).catch(() => null),
    ])
    return { experiment, series, launch, estimate }
  },
  component: ExperimentScreen,
})
