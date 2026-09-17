import { useMatchRoute } from "@tanstack/react-router"
import { MODES, type Mode } from "@/domain"
import { ROUTE_PATH } from "@/lib/routes"

export const MODE_ROUTE = {
  schema: ROUTE_PATH.schema,
  dataflow: ROUTE_PATH.dataflow,
  nodes: ROUTE_PATH.nodes,
  tests: ROUTE_PATH.tests,
  review: ROUTE_PATH.review,
} as const satisfies Readonly<Record<Mode, string>>

const DEFAULT_MODE: Mode = "schema"

export const useCurrentMode = (): Mode => {
  const matchRoute = useMatchRoute()
  const isActive = (mode: Mode): boolean => matchRoute({ to: MODE_ROUTE[mode], fuzzy: true, includeSearch: false }) !== false
  return MODES.find(isActive) ?? DEFAULT_MODE
}
