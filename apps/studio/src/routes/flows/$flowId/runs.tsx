import { createFileRoute } from "@tanstack/react-router"
import type { ApiExecutionAddress, ApiNode, ApiPromptDetail, ApiRunEvent, ApiValueRef, BlobId, FlowId, NodeId, RunId } from "@/domain"
import * as ids from "@/data/ids"
import type { LiveSources } from "@/data/live/sources"
import { CALL_SHEET_TABS, type BlobText, type CallSheetTab } from "@/features/call-sheet"
import { RunsScreen } from "@/features/runs"
import { isBinaryMedia } from "@/features/trace"
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
})

const addressOf = (search: RunsSearch): ApiExecutionAddress | null => {
  if (search.node === undefined) return null
  return { node_id: search.node, branch_key: search.branch ?? null, iteration: search.iter ?? null, item_index: search.item ?? null }
}

const readableBlob = (ref: ApiValueRef | null): ref is Extract<ApiValueRef, { kind: "blob" }> =>
  ref?.kind === "blob" && !isBinaryMedia(ref)

const blobIdsOf = (refs: readonly (ApiValueRef | null)[]): readonly BlobId[] =>
  [...new Set(refs.filter(readableBlob).map((ref) => ids.blobId(ref.blob_id)))]

const readBlobs = async (api: LiveSources, refs: readonly (ApiValueRef | null)[]): Promise<readonly BlobText[]> => {
  const results = await Promise.allSettled(blobIdsOf(refs).map(async (blobId) => ({ blobId, text: await api.blob.read(blobId) })))
  return results.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])
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

const validateRunsSearch = searchValidator(parseRunsSearch)

export const Route = createFileRoute("/flows/$flowId/runs")({
  validateSearch: validateRunsSearch,
  loaderDeps: ({ search }) => ({ runId: search.run ?? null, address: addressOf(search) }),
  loader: async ({ context: { api }, params, deps }) => {
    const [runs, schemas, nodes] = await Promise.all([
      api.run.list({ flowId: params.flowId }),
      api.flow.schemas(params.flowId),
      api.flow.nodes(params.flowId),
    ])
    const runId = deps.runId ?? (runs[0] === undefined ? null : ids.runId(runs[0].run_id))
    const { address } = deps
    const [prompts, snapshot, events, execution] = await Promise.all([
      promptsOf(api, params.flowId, nodes),
      loadWhen(runId, (id) => api.run.snapshot(id)),
      eventsOf(api, runId),
      runId === null || address === null ? null : api.run.execution(runId, address, "full"),
    ])
    const blobs = await readBlobs(api, [
      snapshot?.input_ref ?? null,
      snapshot?.output_ref ?? null,
      ...(snapshot?.executions ?? []).flatMap((item) => [item.input_ref, item.output_ref]),
      execution?.input_ref ?? null,
      execution?.output_ref ?? null,
      execution?.human?.answer_ref ?? null,
    ])
    return { runs, schemas, nodes, prompts, runId, snapshot, events, execution, blobs }
  },
  component: RunsScreen,
})
