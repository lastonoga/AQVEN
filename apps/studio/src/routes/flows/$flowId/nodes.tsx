import { createFileRoute } from "@tanstack/react-router"
import type { ApiNodeDetail, NodeId } from "@/domain"
import * as ids from "@/data/ids"
import { NODE_TABS, NodesScreen, type NodeTab } from "@/features/nodes"
import { parseEnum, parseId } from "@/lib/search"
import { loadWhen } from "@/routes/-load"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

type NodesSearch = { readonly node?: NodeId; readonly tab?: NodeTab }

const parseNode = parseId(ids.nodeId)

const parseTab = parseEnum(NODE_TABS)

const parseNodesSearch = (raw: RawSearch): NodesSearch => ({
  ...optional("node", parseNode(raw["node"])),
  ...optional("tab", parseTab(raw["tab"])),
})

const validateNodesSearch = searchValidator(parseNodesSearch)

const promptNode = (nodeId: NodeId | null, detail: ApiNodeDetail | null): NodeId | null => {
  if (detail === null || detail.prompt === null) return null
  return nodeId
}

export const Route = createFileRoute("/flows/$flowId/nodes")({
  validateSearch: validateNodesSearch,
  loaderDeps: ({ search: { node } }) => ({ node }),
  loader: async ({ context: { api }, params, deps }) => {
    const nodes = await api.flow.nodes(params.flowId)
    const nodeId = deps.node ?? null
    const detail = await loadWhen(nodeId, (id) => api.flow.node(params.flowId, id))
    const prompt = await loadWhen(promptNode(nodeId, detail), (id) => api.flow.prompt(params.flowId, id))
    return { nodes, nodeId, detail, prompt }
  },
  component: NodesScreen,
})
