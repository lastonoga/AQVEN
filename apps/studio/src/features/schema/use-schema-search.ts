import { useNavigate } from "@tanstack/react-router"
import type { InspectorTab, NodeId } from "@/domain"
import { ROUTE_ID, schemaRouteApi } from "@/lib/routes"

export type SchemaSearchFacade = {
  readonly node: NodeId | null
  readonly tab: InspectorTab
  readonly stage: number | null
  readonly legend: boolean
  readonly selectNode: (node: NodeId) => void
  readonly setTab: (tab: InspectorTab) => void
  readonly setStage: (stage: number | null) => void
  readonly toggleLegend: () => void
}

export function useSchemaSearch(): SchemaSearchFacade {
  const navigate = useNavigate({ from: ROUTE_ID.schema })
  const search = schemaRouteApi.useSearch()
  return {
    node: search.node ?? null,
    tab: search.tab,
    stage: search.stage ?? null,
    legend: search.legend,
    selectNode: (node) => {
      void navigate({ search: (prev) => ({ ...prev, node }), replace: true, resetScroll: false })
    },
    setTab: (tab) => {
      void navigate({ search: (prev) => ({ ...prev, tab }), replace: true, resetScroll: false })
    },
    setStage: (stage) => {
      void navigate({
        search: ({ stage: _stage, ...prev }) => (stage === null ? prev : { ...prev, stage }),
        replace: true,
        resetScroll: false,
      })
    },
    toggleLegend: () => {
      void navigate({ search: (prev) => ({ ...prev, legend: !prev.legend }), replace: true, resetScroll: false })
    },
  }
}
