import { useState, type JSX } from "react"
import { useNavigate } from "@tanstack/react-router"
import { SIDE_PANEL_WIDTH } from "@/components/studio"
import * as ids from "@/data/ids"
import { canvasRouteApi, flowRouteApi, ROUTE_PATH } from "@/lib/routes"
import { GraphCanvas } from "./canvas/graph-canvas"
import { withFieldCounts } from "./field-counts"
import { NodeInspector } from "./node-inspector"
import { useGraph } from "./use-graph"

export function CanvasScreen(): JSX.Element {
  const { nodes, fields, detail, prompt } = canvasRouteApi.useLoaderData()
  const order = flowRouteApi.useLoaderData({ select: (data) => data.flow.order })
  const { flowId } = canvasRouteApi.useParams()
  const { node } = canvasRouteApi.useSearch()
  const navigate = useNavigate()
  const [legend, setLegend] = useState(false)
  const graph = useGraph(nodes, order)
  const select = (selected: string): void => {
    void navigate({ to: ROUTE_PATH.canvas, params: { flowId }, search: { node: ids.nodeId(selected) } })
  }
  const close = (): void => {
    void navigate({ to: ROUTE_PATH.canvas, params: { flowId }, search: {}, replace: true })
  }
  return (
    <div className="relative h-full min-h-0">
      {graph === null ? null : (
        <GraphCanvas
          graph={withFieldCounts(graph, fields)}
          selected={node ?? null}
          legend={legend}
          focusInset={detail === null ? 0 : SIDE_PANEL_WIDTH}
          onSelect={select}
          onToggleLegend={() => {
            setLegend((open) => !open)
          }}
        />
      )}
      <NodeInspector flowId={flowId} detail={detail} prompt={prompt} onClose={close} />
    </div>
  )
}
