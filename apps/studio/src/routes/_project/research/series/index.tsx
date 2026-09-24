import { createFileRoute } from "@tanstack/react-router"
import type { FlowId } from "@/domain"
import * as ids from "@/data/ids"
import { SeriesListScreen } from "@/features/research"
import { parseId } from "@/lib/search"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

type SeriesListSearch = { readonly flow?: FlowId }

const parseFlow = parseId(ids.flowId)

const parseSeriesListSearch = (raw: RawSearch): SeriesListSearch => optional("flow", parseFlow(raw["flow"]))

const validateSeriesListSearch = searchValidator(parseSeriesListSearch)

export const Route = createFileRoute("/_project/research/series/")({
  validateSearch: validateSeriesListSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { api }, deps }) => ({ series: await api.research.allSeries(deps.flow), flow: deps.flow ?? null }),
  component: SeriesListScreen,
})
