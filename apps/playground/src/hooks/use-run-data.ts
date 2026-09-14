import { useRun } from "../run/use-run.js"
import { NO_RUN } from "../run-context.js"
import type { ApiClient } from "../api/index.js"
import type { RunNodeView } from "../run/events.js"
import type { RunSelection } from "../run-context.js"

const byNodeId = (nodes: readonly RunNodeView[]): ReadonlyMap<string, RunNodeView> =>
  new Map(nodes.map((node) => [node.nodeId, node]))

export const useRunData = (client: ApiClient, runId: string | null): RunSelection => {
  const state = useRun(client, runId)
  if (runId === null) return NO_RUN
  return {
    runId,
    run: state.run,
    view: state.view,
    nodes: byNodeId(state.view.nodes),
    renders: state.renders,
    loading: state.loading,
    error: state.error,
  }
}
