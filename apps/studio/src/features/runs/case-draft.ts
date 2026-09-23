import type { ApiDatasetSummary, ApiRunSnapshot } from "@/domain"
import { datasetItemOf, type DatasetItem } from "./expected"

export type CaseTarget = {
  readonly flowId: string
  readonly runId: string
  readonly datasetId: string | null
  readonly item: DatasetItem | null
}

const ofFlow = (datasets: readonly ApiDatasetSummary[], flowId: string): readonly ApiDatasetSummary[] =>
  datasets.filter((dataset) => dataset.flow_id === flowId)

export const flowDatasets = (datasets: readonly ApiDatasetSummary[], snapshot: Pick<ApiRunSnapshot, "flow_id">): readonly ApiDatasetSummary[] =>
  ofFlow(datasets, snapshot.flow_id)

export const defaultDataset = (datasets: readonly ApiDatasetSummary[], snapshot: Pick<ApiRunSnapshot, "flow_id" | "dataset_item_id">): string | null => {
  const candidates = ofFlow(datasets, snapshot.flow_id)
  const origin = datasetItemOf(snapshot.dataset_item_id)?.datasetId
  const fromOrigin = candidates.find((dataset) => dataset.dataset_id === origin)
  return (fromOrigin ?? candidates[0])?.dataset_id ?? null
}

const targetLine = (target: CaseTarget): string => {
  if (target.datasetId === null) {
    return `The flow has no dataset yet: create datasets/${target.flowId}_cases.yaml with apiVersion "aqven/v1", kind "Dataset" and flow "${target.flowId}", then add the case to it.`
  }
  const origin = target.item === null ? "" : ` The run came from its case ${target.item.caseName} of ${target.item.datasetId}.`
  return `Add it to the dataset file datasets/${target.datasetId}.yaml of flow ${target.flowId}.${origin}`
}

const draftLines = (yaml: string | null): readonly string[] => {
  if (yaml === null) return ["Build the case from the run input, its context and the outputs of its top-level nodes."]
  return ["Here is the draft the engine built from the run input, its context and the outputs of its top-level nodes:", "```yaml", yaml, "```"]
}

export const toCasesPrompt = (target: CaseTarget, yaml: string | null): string =>
  [
    `Turn run ${target.runId} of flow ${target.flowId} into a dataset case.`,
    targetLine(target),
    ...draftLines(yaml),
    "Keep only the node_outputs this case needs, give the case a descriptive name and meaningful tags, and ask me for expected_output before you write it.",
    "Run aqven check and report the result in this chat.",
  ].join("\n")
