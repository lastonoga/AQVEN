import { createFileRoute, stripSearchParams } from "@tanstack/react-router"
import type { ColumnPath, RunId } from "@/domain"
import * as ids from "@/data/ids"
import { DataflowScreen } from "@/features/dataflow"
import { CALL_SHEET_DEFAULTS, callSheetSearch, parseId, parsePaths, type CallSheetSearch } from "@/lib/search"
import { loadWhen } from "@/routes/-load"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

type DataflowSearch = CallSheetSearch & {
  readonly run?: RunId
  readonly open?: readonly ColumnPath[]
}

const parseRun = parseId(ids.runId)

const parseDataflowSearch = (raw: RawSearch): DataflowSearch => ({
  ...callSheetSearch(raw),
  ...optional("run", parseRun(raw["run"])),
  ...optional("open", parsePaths(raw["open"])),
})

const validateDataflowSearch = searchValidator(parseDataflowSearch)

export const Route = createFileRoute("/$locale/$workspaceId/$workflowId/dataflow")({
  validateSearch: validateDataflowSearch,
  search: { middlewares: [stripSearchParams(CALL_SHEET_DEFAULTS)] },
  loaderDeps: ({ search: { run, call } }) => ({ run, call }),
  loader: async ({ context: { sources }, params, deps }) => {
    const [runs, call] = await Promise.all([
      sources.runs.list(params),
      loadWhen(deps.call, (callId) => sources.runs.call(params, callId)),
    ])
    const runId = deps.run ?? runs[0]?.id ?? null
    const dataflow = await loadWhen(runId, (id) => sources.runs.dataflow(params, id))
    return { runs, runId, dataflow, call }
  },
  component: DataflowScreen,
})
