import { createFileRoute } from "@tanstack/react-router"
import type { SeriesCaseFilter } from "@/domain"
import * as ids from "@/data/ids"
import { SeriesScreen } from "@/features/research"
import { parseFlag } from "@/lib/search"
import { orNotFound } from "@/routes/-api-error"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

const onlyTrue = (raw: unknown): true | undefined => (parseFlag(raw) === true ? true : undefined)

const parseSeriesSearch = (raw: RawSearch): SeriesCaseFilter => ({
  ...optional("failures", onlyTrue(raw["failures"])),
  ...optional("divergent", onlyTrue(raw["divergent"])),
})

const validateSeriesSearch = searchValidator(parseSeriesSearch)

export const Route = createFileRoute("/_project/research/series/$seriesId")({
  params: {
    parse: ({ seriesId }) => ({ seriesId: ids.seriesId(seriesId) }),
    stringify: ({ seriesId }) => ({ seriesId }),
  },
  validateSearch: validateSeriesSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { api }, params, deps }) => {
    const series = await orNotFound(api.research.series(params.seriesId))
    const [cases, experiment] = await Promise.all([
      api.research.seriesCases(params.seriesId, deps),
      series.origin.kind === "experiment" ? api.research.experiment(series.origin.experiment) : null,
    ])
    return { series, cases, experiment, filter: deps }
  },
  component: SeriesScreen,
})
