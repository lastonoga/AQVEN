import { createFileRoute } from "@tanstack/react-router"
import type { FlowId } from "@/domain"
import { isNotFound } from "@/api/client"
import { EvalsScreen, type EvalsData, type EvalSummary } from "@/features/evals"
import { parseIndex, parseText } from "@/lib/search"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

type EvalsSearch = {
  readonly eval?: string
  readonly run?: string
  readonly case?: string
  readonly rep?: number
}

const EVALS_ROOT = "evals"

const parseEvalsSearch = (raw: RawSearch): EvalsSearch => ({
  ...optional("eval", parseText(raw["eval"])),
  ...optional("run", parseText(raw["run"])),
  ...optional("case", parseText(raw["case"])),
  ...optional("rep", parseIndex(raw["rep"])),
})

const inFlow = (flowId: FlowId) => (item: EvalSummary) => item.path.startsWith(`${EVALS_ROOT}/${flowId}/`)

const orNull = async <T,>(load: Promise<T>): Promise<T | null> =>
  load.catch((error: unknown) => {
    if (isNotFound(error)) return null
    throw error
  })

const validateEvalsSearch = searchValidator(parseEvalsSearch)

export const Route = createFileRoute("/flows/$flowId/evals")({
  validateSearch: validateEvalsSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { api }, params, deps }): Promise<EvalsData> => {
    const evals = (await api.evals.list()).filter(inFlow(params.flowId))
    const chosen = evals.find((item) => item.eval_id === deps.eval) ?? evals[0] ?? null
    if (chosen === null) {
      return { evals, selected: null, dataset: null, runs: [], run: null, cases: [], gate: null, caseName: null, caseRepeat: null }
    }
    const [selected, dataset, runs] = await Promise.all([
      api.evals.detail(chosen.eval_id),
      orNull(api.evals.dataset(chosen.dataset)),
      api.evals.runs(chosen.eval_id),
    ])
    const picked = runs.find((item) => item.eval_run_id === deps.run) ?? runs[0] ?? null
    if (picked === null) {
      return { evals, selected, dataset, runs, run: null, cases: [], gate: null, caseName: null, caseRepeat: null }
    }
    const [run, cases, gate] = await Promise.all([
      api.evals.run(picked.eval_run_id),
      api.evals.cases(picked.eval_run_id),
      orNull(api.evals.gate(picked.eval_run_id)),
    ])
    return { evals, selected, dataset, runs, run, cases, gate, caseName: deps.case ?? null, caseRepeat: deps.rep ?? null }
  },
  component: EvalsScreen,
})
