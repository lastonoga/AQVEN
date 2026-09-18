import type { ApiFlow, FlowId } from "@/domain"
import { flowId } from "@/data/ids"

export type Landing = { readonly kind: "project" } | { readonly kind: "flow"; readonly flowId: FlowId }

const startedAt = (flow: ApiFlow): number => (flow.last_run === null ? 0 : Date.parse(flow.last_run.started_at))

export const landingFlow = (flows: readonly ApiFlow[]): Landing => {
  const ranked = [...flows].sort((left, right) => startedAt(right) - startedAt(left) || right.node_count - left.node_count)
  const first = ranked[0]
  if (first === undefined) return { kind: "project" }
  return { kind: "flow", flowId: flowId(first.flow_id) }
}
