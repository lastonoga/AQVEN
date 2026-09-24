import { createFileRoute } from "@tanstack/react-router"
import { SeriesListScreen } from "@/features/research"

export const Route = createFileRoute("/_project/research/series/")({
  loader: async ({ context: { api } }) => ({ series: await api.research.allSeries() }),
  component: SeriesListScreen,
})
