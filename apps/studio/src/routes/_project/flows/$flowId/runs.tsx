import { createFileRoute } from "@tanstack/react-router"
import type { ApiNode, ApiPromptDetail, ApiRunEvent, FlowId, RunId } from "@/domain"
import * as ids from "@/data/ids"
import type { LiveSources } from "@/data/live/sources"
import { readRunBlobs, RunsScreen, snapshotRefs, type RunComparison } from "@/features/runs"
import { parseId } from "@/lib/search"
import { loadWhen } from "@/routes/-load"
import { loadExpected } from "@/routes/-run-load"
import { addressOf, parseRunAddressSearch, type RunAddressSearch } from "@/routes/-run-search"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

type RunsSearch = RunAddressSearch & {
  readonly run?: RunId
  readonly compare?: RunId
}

const parseRun = parseId(ids.runId)

const parseRunsSearch = (raw: RawSearch): RunsSearch => ({
  ...optional("run", parseRun(raw["run"])),
  ...parseRunAddressSearch(raw),
  ...optional("compare", parseRun(raw["compare"])),
})

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
