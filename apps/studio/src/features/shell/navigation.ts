import { useMatchRoute } from "@tanstack/react-router"
import type { FlowId } from "@/domain"
import { ROUTE_PATH } from "@/lib/routes"

export const PROJECT_MODES = ["flow", "research"] as const
export type ProjectMode = (typeof PROJECT_MODES)[number]

export const FLOW_TABS = ["canvas", "runs", "cases"] as const
export type FlowTab = (typeof FLOW_TABS)[number]

export const FLOW_TAB_ROUTE = {
  canvas: ROUTE_PATH.canvas,
  runs: ROUTE_PATH.runs,
  cases: ROUTE_PATH.cases,
} as const satisfies Readonly<Record<FlowTab, string>>

export const RESEARCH_TABS = ["experiments", "series"] as const
export type ResearchTab = (typeof RESEARCH_TABS)[number]

export const RESEARCH_TAB_ROUTE = {
  experiments: ROUTE_PATH.research,
  series: ROUTE_PATH.seriesList,
} as const satisfies Readonly<Record<ResearchTab, string>>

export type ResearchSearch = { readonly flow?: FlowId }

export const researchSearch = (flow: FlowId | null): ResearchSearch => (flow === null ? {} : { flow })

const DEFAULT_TAB: FlowTab = "canvas"

const FUZZY_PATH = { fuzzy: true, includeSearch: false } as const

const useIsAt = (): ((to: string) => boolean) => {
  const matchRoute = useMatchRoute()
  return (to) => matchRoute({ to, ...FUZZY_PATH }) !== false
}

export const useCurrentFlowTab = (): FlowTab => {
  const isAt = useIsAt()
  return FLOW_TABS.find((tab) => isAt(FLOW_TAB_ROUTE[tab])) ?? DEFAULT_TAB
}

export const useCurrentMode = (): ProjectMode | null => {
  const isAt = useIsAt()
  if (isAt(ROUTE_PATH.research)) return "research"
  if (isAt(ROUTE_PATH.settings)) return null
  return "flow"
}

export const useCurrentResearchTab = (): ResearchTab => (useIsAt()(ROUTE_PATH.seriesList) ? "series" : "experiments")
