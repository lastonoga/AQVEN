import { useMatchRoute } from "@tanstack/react-router"
import { ROUTE_PATH } from "@/lib/routes"

export const PROJECT_SECTIONS = ["flows", "research", "settings"] as const
export type ProjectSection = (typeof PROJECT_SECTIONS)[number]

export const SECTION_ROUTE = {
  flows: ROUTE_PATH.flows,
  research: ROUTE_PATH.research,
  settings: ROUTE_PATH.settings,
} as const satisfies Readonly<Record<ProjectSection, string>>

export const FLOW_TABS = ["canvas", "runs", "cases"] as const
export type FlowTab = (typeof FLOW_TABS)[number]

export const FLOW_TAB_ROUTE = {
  canvas: ROUTE_PATH.canvas,
  runs: ROUTE_PATH.runs,
  cases: ROUTE_PATH.cases,
} as const satisfies Readonly<Record<FlowTab, string>>

const DEFAULT_TAB: FlowTab = "canvas"

export const useCurrentFlowTab = (): FlowTab => {
  const matchRoute = useMatchRoute()
  const isActive = (tab: FlowTab): boolean => matchRoute({ to: FLOW_TAB_ROUTE[tab], fuzzy: true, includeSearch: false }) !== false
  return FLOW_TABS.find(isActive) ?? DEFAULT_TAB
}
