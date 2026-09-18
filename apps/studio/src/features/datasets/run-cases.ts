import type { ApiRunStartRequest, FlowId, NodeId } from "@/domain"

export type DatasetCaseRun = {
  readonly caseName: string
  readonly runId: string | null
  readonly error: string | null
}

export async function startDatasetCases(
  datasetId: string,
  caseNames: readonly string[],
  flowId: FlowId,
  selectedNodes: readonly NodeId[] | null,
  start: (request: ApiRunStartRequest) => Promise<{ readonly run_id: string }>,
): Promise<readonly DatasetCaseRun[]> {
  const results: DatasetCaseRun[] = []
  for (const caseName of caseNames) {
    const request: ApiRunStartRequest = {
      flow_id: flowId,
      at: "working",
      mode: "live",
      dataset_item_id: `${datasetId}/${caseName}`,
      selected_nodes: selectedNodes === null ? null : [...selectedNodes],
    }
    try {
      const started = await start(request)
      results.push({ caseName, runId: started.run_id, error: null })
    } catch (reason) {
      results.push({ caseName, runId: null, error: reason instanceof Error ? reason.message : String(reason) })
    }
  }
  return results
}
