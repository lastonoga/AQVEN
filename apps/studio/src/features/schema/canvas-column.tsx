import type { SchemaGraph } from "@/domain"
import { SchemaCanvas } from "./canvas/schema-canvas"
import { StageRail } from "./stage-rail"
import type { SchemaSearchFacade } from "./use-schema-search"

export type CanvasColumnProps = { readonly graph: SchemaGraph; readonly search: SchemaSearchFacade }

export function CanvasColumn({ graph, search }: CanvasColumnProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <StageRail stages={graph.stages} value={search.stage} onValueChange={search.setStage} />
      <div className="relative min-h-0 flex-1">
        <SchemaCanvas
          graph={graph}
          selected={search.node}
          stage={search.stage}
          legend={search.legend}
          onSelect={search.selectNode}
          onToggleLegend={search.toggleLegend}
        />
      </div>
    </div>
  )
}
