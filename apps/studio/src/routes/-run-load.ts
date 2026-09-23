import type { ApiRunSnapshot } from "@/domain"
import type { LiveSources } from "@/data/live/sources"
import { datasetItemOf, expectedCaseOf, type ExpectedCase } from "@/features/runs"

export const loadExpected = async (api: LiveSources, snapshot: ApiRunSnapshot | null): Promise<ExpectedCase> => {
  const item = datasetItemOf(snapshot?.dataset_item_id)
  if (item === null) return expectedCaseOf(null, null)
  const found = await api.datasets.caseDetail(item.datasetId, item.caseName).catch(() => null)
  return expectedCaseOf(item, found)
}
