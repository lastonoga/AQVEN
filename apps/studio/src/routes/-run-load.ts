import type { ApiRunSnapshot, ExperimentFlowDetail } from "@/domain"
import * as ids from "@/data/ids"
import type { LiveSources } from "@/data/live/sources"
import { datasetItemOf, expectedCaseOf, type ExpectedCase } from "@/features/runs"

export const loadExpected = async (api: LiveSources, snapshot: ApiRunSnapshot | null): Promise<ExpectedCase> => {
  const item = datasetItemOf(snapshot?.dataset_item_id)
  if (item === null) return expectedCaseOf(null, null)
  const found = await api.datasets.caseDetail(item.datasetId, item.caseName).catch(() => null)
  return expectedCaseOf(item, found)
}

const present = (value: string | null | undefined): value is string => value !== null && value !== undefined

export const loadExperimentFlow = async (api: LiveSources, snapshot: ApiRunSnapshot): Promise<ExperimentFlowDetail | null> => {
  const owner = snapshot.flow_experiment_id
  if (!present(owner)) return null
  return api.research.experimentFlow(ids.experimentId(owner), ids.flowId(snapshot.flow_id)).catch(() => null)
}

export const isProjectFlowRun = async (api: LiveSources, snapshot: ApiRunSnapshot): Promise<boolean> => {
  if (present(snapshot.flow_experiment_id)) return false
  return api.flow.detail(ids.flowId(snapshot.flow_id)).then(() => true, () => false)
}
