import { createFileRoute } from "@tanstack/react-router"
import type { ExperimentDetail, LaunchRequest } from "@/domain"
import * as ids from "@/data/ids"
import { ExperimentScreen } from "@/features/research"
import { orNotFound } from "@/routes/-api-error"

const planLaunch = (experiment: ExperimentDetail): LaunchRequest => ({
  on: "dev",
  cases: experiment.plan.cases ?? experiment.cases.selected,
  repeats: experiment.plan.repeats,
})

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
      api.research.estimate(params.experimentId, launch),
    ])
    return { experiment, series, launch, estimate }
  },
  component: ExperimentScreen,
})
