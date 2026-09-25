import { createFileRoute } from "@tanstack/react-router"
import { NewExperimentScreen } from "@/features/research"

export const Route = createFileRoute("/_project/research/experiments/new")({
  loader: async ({ context: { api } }) => {
    const experiments = await api.research.experiments()
    return { taken: experiments.map((experiment) => experiment.id) }
  },
  component: NewExperimentScreen,
})
