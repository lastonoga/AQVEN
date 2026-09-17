import { createFileRoute } from "@tanstack/react-router"
import type { NodeId } from "@/domain"
import * as ids from "@/data/ids"
import { NodesScreen } from "@/features/nodes"
import { parseId } from "@/lib/search"
import { loadWhen } from "@/routes/-load"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

type NodesSearch = { readonly node?: NodeId }

const parseNode = parseId(ids.nodeId)

const parseNodesSearch = (raw: RawSearch): NodesSearch => optional("node", parseNode(raw["node"]))

const validateNodesSearch = searchValidator(parseNodesSearch)

export const Route = createFileRoute("/$locale/$workspaceId/$workflowId/nodes")({
  validateSearch: validateNodesSearch,
  loaderDeps: ({ search: { node } }) => ({ node }),
  loader: async ({ context: { sources }, params, deps }) => {
    const overview = await sources.nodes.overview(params)
    const nodeId = deps.node ?? overview.nodes[0]?.id ?? null
    const contract = await loadWhen(nodeId, (id) => sources.nodes.contract(params, id))
    return { overview, nodeId, contract }
  },
  component: NodesScreen,
})
