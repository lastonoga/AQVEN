import { useMatch } from "@tanstack/react-router"
import type { ApiFlow, ApiProject, FlowId } from "@/domain"
import { rememberedFlow } from "@/lib/last-flow"
import { landingFlow } from "@/lib/landing"
import { ROUTE_ID } from "@/lib/routes"

export type FlowScope = FlowId | null

const NO_FLOW: FlowScope = null

export const useRoutedFlow = (): FlowId | undefined => useMatch({ from: ROUTE_ID.flow, shouldThrow: false })?.params.flowId

export const fallbackFlow = (project: ApiProject, flows: readonly ApiFlow[]): FlowScope => {
  const landing = landingFlow(flows, rememberedFlow(project.root))
  return landing.kind === "flow" ? landing.flowId : NO_FLOW
}
