import { useResource } from "../hooks/use-resource.js"
import { startedRuns } from "../run/registry.js"
import type { ApiClient, Run, RunStatus } from "../api/index.js"
import type { RunSelection } from "../run-context.js"

export type FlowRun = { id: string; startedAt: number; status: RunStatus | null }

export type FlowRuns = { rows: FlowRun[]; latest: FlowRun | null; error: string | null; loaded: boolean }

const fromServer = (runs: Run[], flowId: string): FlowRun[] =>
  runs.filter((run) => run.flow === flowId).map((run) => ({ id: run.id, startedAt: run.startedAt, status: run.status }))

const fromRegistry = (flowId: string): FlowRun[] =>
  startedRuns()
    .filter((item) => item.flow === flowId)
    .map((item) => ({ id: item.id, startedAt: item.startedAt, status: null }))

const loadRuns = async (client: ApiClient, flowId: string): Promise<FlowRun[]> => {
  const listed = await client.listRuns()
  const rows = listed === null ? fromRegistry(flowId) : fromServer(listed, flowId)
  return [...rows].sort((a, b) => b.startedAt - a.startedAt)
}

const withSelected = (rows: FlowRun[], selection: RunSelection): FlowRun[] => {
  if (selection.runId === null) return rows
  if (rows.some((row) => row.id === selection.runId)) return rows
  const startedAt = selection.run?.startedAt ?? Date.now()
  return [{ id: selection.runId, startedAt, status: selection.run?.status ?? null }, ...rows]
}

export const useFlowRuns = (
  client: ApiClient,
  flowId: string,
  revision: number,
  selection: RunSelection,
): FlowRuns => {
  const status = selection.view?.status ?? "none"
  const resource = useResource(() => loadRuns(client, flowId), `flow-runs:${flowId}:${revision}:${status}`)
  const rows = withSelected(resource.data ?? [], selection)
  return { rows, latest: rows[0] ?? null, error: resource.error, loaded: resource.data !== null }
}
