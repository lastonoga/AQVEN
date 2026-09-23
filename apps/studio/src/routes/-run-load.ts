import type { ApiRunSnapshot, ArmFlow } from "@/domain"
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

export const loadArm = async (api: LiveSources, snapshot: ApiRunSnapshot): Promise<ArmFlow | null> => {
  const { experiment_id: experiment, arm_id: arm } = snapshot
  if (!present(experiment) || !present(arm)) return null
  return api.research.armFlow(ids.experimentId(experiment), ids.armId(arm)).catch(() => null)
}
