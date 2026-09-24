import { useMatch } from "@tanstack/react-router"
import type { ApiFlow, ApiProject, FlowId } from "@/domain"
import { rememberedFlow } from "@/lib/last-flow"
import { landingFlow } from "@/lib/landing"
import { ROUTE_ID } from "@/lib/routes"

export type FlowScope = FlowId | null

type Routed = FlowScope | undefined

const ALL_FLOWS: FlowScope = null

const scopeOfSearch = (matched: boolean, flow: FlowId | undefined): Routed => {
  if (!matched) return undefined
  return flow ?? ALL_FLOWS
}

export const useRoutedFlow = (): Routed => {
  const flow = useMatch({ from: ROUTE_ID.flow, shouldThrow: false })
  const research = useMatch({ from: ROUTE_ID.research, shouldThrow: false })
  const seriesList = useMatch({ from: ROUTE_ID.seriesList, shouldThrow: false })
  const experiment = useMatch({ from: ROUTE_ID.experiment, shouldThrow: false })
  const series = useMatch({ from: ROUTE_ID.series, shouldThrow: false })
  const routed: readonly Routed[] = [
    flow?.params.flowId,
    scopeOfSearch(research !== undefined, research?.search.flow),
    scopeOfSearch(seriesList !== undefined, seriesList?.search.flow),
    experiment?.loaderData?.experiment.flow,
    series?.loaderData?.series.flow,
  ]
  return routed.find((scope) => scope !== undefined)
}

export const fallbackFlow = (project: ApiProject, flows: readonly ApiFlow[]): FlowScope => {
  const landing = landingFlow(flows, rememberedFlow(project.root))
  return landing.kind === "flow" ? landing.flowId : ALL_FLOWS
}
