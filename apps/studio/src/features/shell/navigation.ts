import { useMatchRoute } from "@tanstack/react-router"
import { ROUTE_PATH } from "@/lib/routes"

export const FLOW_TABS = ["runs", "canvas", "datasets", "evals"] as const
const ROUTE_TABS = ["canvas", "nodes", "datasets", "runs", "review", "evals"] as const
export type FlowTab = (typeof ROUTE_TABS)[number]

export const FLOW_TAB_ROUTE = {
  canvas: ROUTE_PATH.canvas,
  nodes: ROUTE_PATH.nodes,
  runs: ROUTE_PATH.runs,
  datasets: ROUTE_PATH.datasets,
  review: ROUTE_PATH.review,
  evals: ROUTE_PATH.evals,
} as const satisfies Readonly<Record<FlowTab, string>>

const DEFAULT_TAB: FlowTab = "canvas"

export const useCurrentFlowTab = (): FlowTab => {
  const matchRoute = useMatchRoute()
  const isActive = (tab: FlowTab): boolean => matchRoute({ to: FLOW_TAB_ROUTE[tab], fuzzy: true, includeSearch: false }) !== false
  return ROUTE_TABS.find(isActive) ?? DEFAULT_TAB
}
