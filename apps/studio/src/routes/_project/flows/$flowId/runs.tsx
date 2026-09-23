import { createFileRoute } from "@tanstack/react-router"
import type { ApiExecutionAddress, ApiNode, ApiPromptDetail, ApiRunEvent, ApiRunSnapshot, FlowId, NodeId, RunId } from "@/domain"
import * as ids from "@/data/ids"
import type { LiveSources } from "@/data/live/sources"
import { CALL_SHEET_TABS, type CallSheetTab } from "@/features/call-sheet"
import { datasetItemOf, expectedCaseOf, readRunBlobs, RunsScreen, snapshotRefs, type ExpectedCase, type RunComparison } from "@/features/runs"
import { parseEnum, parseId, parseIndex, parseText } from "@/lib/search"
import { loadWhen } from "@/routes/-load"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

type RunsSearch = {
  readonly run?: RunId
  readonly stage?: string
  readonly node?: NodeId
  readonly branch?: string
  readonly iter?: number
  readonly item?: number
  readonly tab?: CallSheetTab
  readonly compare?: RunId
}

const parseRun = parseId(ids.runId)
const parseNode = parseId(ids.nodeId)
const parseTab = parseEnum(CALL_SHEET_TABS)

const parseRunsSearch = (raw: RawSearch): RunsSearch => ({
  ...optional("run", parseRun(raw["run"])),
  ...optional("stage", parseText(raw["stage"])),
  ...optional("node", parseNode(raw["node"])),
  ...optional("branch", parseText(raw["branch"])),
  ...optional("iter", parseIndex(raw["iter"])),
  ...optional("item", parseIndex(raw["item"])),
  ...optional("tab", parseTab(raw["tab"])),
  ...optional("compare", parseRun(raw["compare"])),
})

const addressOf = (search: RunsSearch): ApiExecutionAddress | null => {
  if (search.node === undefined) return null
  return { node_id: search.node, branch_key: search.branch ?? null, iteration: search.iter ?? null, item_index: search.item ?? null }
}

const promptsOf = async (
  api: LiveSources,
  flowId: FlowId,
  nodes: readonly ApiNode[],
): Promise<Readonly<Record<string, ApiPromptDetail>>> => {
  const named = nodes.filter((node) => node.prompt_level !== null)
  const details = await Promise.all(named.map(async (node) => api.flow.prompt(flowId, ids.nodeId(node.node_id))))
  return Object.fromEntries(details.map((detail) => [detail.node_id, detail]))
}

const eventsOf = async (api: LiveSources, runId: RunId | null): Promise<readonly ApiRunEvent[]> =>
  runId === null ? [] : api.run.events(runId)

const comparisonOf = async (api: LiveSources, runId: RunId): Promise<RunComparison> => {
  const [snapshot, events] = await Promise.all([api.run.snapshot(runId), api.run.events(runId)])
  return { snapshot, events }
}

const loadComparison = async (api: LiveSources, compare: RunId | null, runId: RunId | null): Promise<RunComparison | null> => {
  if (compare === null || compare === runId) return null
  return comparisonOf(api, compare).catch(() => null)
}

const loadExpected = async (api: LiveSources, snapshot: ApiRunSnapshot | null): Promise<ExpectedCase> => {
  const item = datasetItemOf(snapshot?.dataset_item_id)
  if (item === null) return expectedCaseOf(null, null)
  const found = await api.evals.datasetCase(item.datasetId, item.caseName).catch(() => null)
  return expectedCaseOf(item, found)
}

const validateRunsSearch = searchValidator(parseRunsSearch)

export const Route = createFileRoute("/_project/flows/$flowId/runs")({
  validateSearch: validateRunsSearch,
  loaderDeps: ({ search }) => ({ runId: search.run ?? null, address: addressOf(search), compare: search.compare ?? null }),
  loader: async ({ context: { api }, params, deps }) => {
    const [runs, schemas, nodes] = await Promise.all([
      api.run.list({ flowId: params.flowId }),
      api.flow.schemas(params.flowId),
      api.flow.nodes(params.flowId),
    ])
    const runId = deps.runId ?? (runs[0] === undefined ? null : ids.runId(runs[0].run_id))
    const { address, compare } = deps
    const [prompts, snapshot, events, execution, comparison] = await Promise.all([
      promptsOf(api, params.flowId, nodes),
      loadWhen(runId, (id) => api.run.snapshot(id)),
      eventsOf(api, runId),
      runId === null || address === null ? null : api.run.execution(runId, address, "full"),
      loadComparison(api, compare, runId),
    ])
    const [blobs, expected] = await Promise.all([
      readRunBlobs(api.blob, [
        ...snapshotRefs(snapshot),
        ...snapshotRefs(comparison?.snapshot ?? null),
        execution?.input_ref ?? null,
        execution?.output_ref ?? null,
        execution?.human?.answer_ref ?? null,
      ]),
      loadExpected(api, snapshot),
    ])
    return { runs, schemas, nodes, prompts, runId, snapshot, events, execution, blobs, comparison, expected }
  },
  component: RunsScreen,
})
