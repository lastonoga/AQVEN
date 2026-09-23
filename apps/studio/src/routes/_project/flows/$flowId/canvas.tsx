import { createFileRoute } from "@tanstack/react-router"
import type { ApiNodeDetail, NodeId } from "@/domain"
import * as ids from "@/data/ids"
import { CanvasScreen } from "@/features/flow"
import { parseId } from "@/lib/search"
import { loadWhen } from "@/routes/-load"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

type CanvasSearch = { readonly node?: NodeId }

const parseNode = parseId(ids.nodeId)

const parseCanvasSearch = (raw: RawSearch): CanvasSearch => optional("node", parseNode(raw["node"]))

const validateCanvasSearch = searchValidator(parseCanvasSearch)

const promptNode = (nodeId: NodeId | undefined, detail: ApiNodeDetail | null): NodeId | null =>
  detail === null || detail.prompt === null || nodeId === undefined ? null : nodeId

export const Route = createFileRoute("/_project/flows/$flowId/canvas")({
  validateSearch: validateCanvasSearch,
  loaderDeps: ({ search: { node } }) => ({ node }),
  loader: async ({ context: { api }, params, deps }) => {
    const [nodes, detail] = await Promise.all([
      api.flow.nodes(params.flowId),
      loadWhen(deps.node, (nodeId) => api.flow.node(params.flowId, nodeId)),
    ])
    const prompt = await loadWhen(promptNode(deps.node, detail), (nodeId) => api.flow.prompt(params.flowId, nodeId))
    return { nodes, detail, prompt }
  },
  component: CanvasScreen,
})
