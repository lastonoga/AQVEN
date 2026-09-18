import { createFileRoute } from "@tanstack/react-router"
import { DatasetsScreen } from "@/features/datasets"
import { parseFlag, parseText } from "@/lib/search"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

type DatasetsSearch = {
  readonly dataset?: string
  readonly case?: string
  readonly batch?: string
  readonly create?: boolean
}

const parseDatasetsSearch = (raw: RawSearch): DatasetsSearch => ({
  ...optional("dataset", parseText(raw["dataset"])),
  ...optional("case", parseText(raw["case"])),
  ...optional("batch", parseText(raw["batch"])),
  ...optional("create", parseFlag(raw["create"])),
})

const validateDatasetsSearch = searchValidator(parseDatasetsSearch)

export const Route = createFileRoute("/flows/$flowId/datasets")({
  validateSearch: validateDatasetsSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { api }, params, deps }) => {
    const [datasets, nodes, draft] = await Promise.all([
      api.evals.datasets(),
      api.flow.nodes(params.flowId),
      deps.create === true ? api.evals.draftDataset(params.flowId) : null,
    ])
    const selected = datasets.find((item) => item.dataset_id === deps.dataset)
      ?? datasets.find((item) => item.flow_id === params.flowId)
      ?? datasets[0]
      ?? null
    const first = selected === null ? null : (await api.evals.datasetCasesPage(selected.dataset_id, null, null, null, 1)).items[0] ?? null
    const chosenCase = selected === null || deps.case === undefined
      ? first
      : first?.name === deps.case ? first : await api.evals.datasetCase(selected.dataset_id, deps.case)
    return { datasets, selected, chosenCase, nodes, draft }
  },
  component: DatasetsScreen,
})
