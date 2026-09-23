import type { components } from "@/api/schema"
import supportCaseDataset from "./support-case-cases.json"

type S = components["schemas"]

export const liveDatasets: readonly S["DatasetSummary"][] = [
  {
    dataset_id: "support_case_cases",
    flow_id: "support_case",
    path: "datasets/support_case_cases.yaml",
    file_hash: "sha256-demo-support-case-cases",
    cases: 3,
    splits: { train: 1, dev: 1, test: 1 },
  },
  {
    dataset_id: "planted_defect_replies",
    flow_id: null,
    path: "datasets/planted_defect_replies.yaml",
    file_hash: "sha256-6d29401f1cb24362a0f34929e06a64c3a59fd5aa2d72427e75757dafa444e617",
    cases: 3,
    splits: {},
  },
]

export const liveDatasetCases: Readonly<Record<string, readonly S["DatasetCase"][]>> = {
  support_case_cases: supportCaseDataset.cases,
  planted_defect_replies: [
    { name: "strip_heat_clean", inputs: { summary: "Flow Strip controller overheats" }, tags: { planted: "no", defect: "none" } },
    { name: "strip_heat_wrong_amount", inputs: { summary: "Flow Strip controller overheats" }, tags: { planted: "yes", defect: "wrong_amount" } },
    { name: "bulb_router_clean", inputs: { summary: "Bulb drops off the network after a router change" }, tags: { planted: "no", defect: "none" } },
  ],
}
