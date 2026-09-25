import { createFileRoute } from "@tanstack/react-router"
import type { ExperimentDetail } from "@/domain"
import type { LiveSources } from "@/data/live/sources"
import { CasesScreen, isTagToken, pickDataset, type CasesSearch } from "@/features/cases"
import { parseText } from "@/lib/search"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

const NO_EXPERIMENTS: readonly ExperimentDetail[] = []

const parseTags = (raw: unknown): readonly string[] | undefined => {
  const values: readonly unknown[] = Array.isArray(raw) ? raw : [raw]
  const tokens = values.filter((value): value is string => typeof value === "string" && isTagToken(value))
  return tokens.length === 0 ? undefined : [...new Set(tokens)]
}

const parseCasesSearch = (raw: RawSearch): CasesSearch => ({
  ...optional("dataset", parseText(raw["dataset"])),
  ...optional("case", parseText(raw["case"])),
  ...optional("tag", parseTags(raw["tag"])),
})

const validateCasesSearch = searchValidator(parseCasesSearch)

const experimentsOf = async (api: LiveSources): Promise<readonly ExperimentDetail[]> => {
  const summaries = await api.research.experiments()
  return Promise.all(summaries.map(async (summary) => api.research.experiment(summary.id)))
}

export const Route = createFileRoute("/_project/flows/$flowId/cases")({
  validateSearch: validateCasesSearch,
  loaderDeps: ({ search }) => ({ dataset: search.dataset }),
  loader: async ({ context: { api }, params, deps }) => {
    const [datasets, experiments, schemas] = await Promise.all([
      api.datasets.list(),
      experimentsOf(api).catch(() => NO_EXPERIMENTS),
      api.flow.schemas(params.flowId).catch(() => null),
    ])
    const selected = pickDataset(datasets, deps.dataset, params.flowId)
    const cases = selected === null ? [] : await api.datasets.cases(selected.dataset_id)
    const used = selected === null ? NO_EXPERIMENTS : experiments.filter((experiment) => experiment.cases.dataset === selected.dataset_id)
    return { datasets, selected, cases, schemas, experiments: used }
  },
  component: CasesScreen,
})
