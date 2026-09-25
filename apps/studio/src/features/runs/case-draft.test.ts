import { describe, expect, it } from "vitest"
import type { ApiDatasetSummary } from "@/domain"
import { defaultDataset, flowDatasets, toCasesPrompt } from "./case-draft"

const RUN_ID = "01a0b104-4658-70aa-b49b-7c2586b56d92"

const dataset = (datasetId: string, flowId: string | null): ApiDatasetSummary => ({
  dataset_id: datasetId,
  flow_id: flowId,
  path: `datasets/${datasetId}.yaml`,
  media_folder: `datasets/${datasetId}`,
  file_hash: "sha256-1",
  cases: 3,
  splits: { dev: 2, holdout: 1 },
})

const DATASETS = [dataset("planted", null), dataset("support_case_cases", "support_case"), dataset("support_case_extra", "support_case")]

describe("target dataset", () => {
  it("keeps only the datasets of the run's flow", () => {
    expect(flowDatasets(DATASETS, { flow_id: "support_case" }).map((item) => item.dataset_id)).toEqual(["support_case_cases", "support_case_extra"])
    expect(flowDatasets(DATASETS, { flow_id: "critique_only" })).toEqual([])
  })

  it("prefers the dataset the run came from, then the first dataset of the flow", () => {
    expect(defaultDataset(DATASETS, { flow_id: "support_case", dataset_item_id: "support_case_extra/strip" })).toBe("support_case_extra")
    expect(defaultDataset(DATASETS, { flow_id: "support_case", dataset_item_id: "planted/strip" })).toBe("support_case_cases")
    expect(defaultDataset(DATASETS, { flow_id: "support_case", dataset_item_id: null })).toBe("support_case_cases")
    expect(defaultDataset(DATASETS, { flow_id: "critique_only", dataset_item_id: null })).toBeNull()
  })
})

describe("toCasesPrompt", () => {
  it("hands the engine's draft to the chat with the dataset file to write", () => {
    const prompt = toCasesPrompt(
      { flowId: "support_case", runId: RUN_ID, datasetId: "support_case_cases", item: { datasetId: "support_case_cases", caseName: "strip" } },
      "name: support_case_01a0b104",
    )
    expect(prompt).toContain(`Turn run ${RUN_ID} of flow support_case into a dataset case.`)
    expect(prompt).toContain("datasets/support_case_cases.yaml of flow support_case. The run came from its case strip of support_case_cases.")
    expect(prompt).toContain("```yaml\nname: support_case_01a0b104\n```")
    expect(prompt).toContain("ask me for expected_output")
  })

  it("asks for a dataset when the flow has none", () => {
    const prompt = toCasesPrompt({ flowId: "critique_only", runId: RUN_ID, datasetId: null, item: null }, null)
    expect(prompt).toContain("create datasets/critique_only_cases.yaml with apiVersion")
    expect(prompt).not.toContain("```yaml")
  })
})
