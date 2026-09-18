import { describe, expect, it } from "vitest"
import { flowId, nodeId } from "@/data/ids"
import { startDatasetCases } from "./run-cases"

describe("dataset runs", () => {
  it("starts every case with the same node scope and reports individual failures", async () => {
    const requests: string[] = []
    const results = await startDatasetCases(
      "support_case_cases",
      ["first", "second", "third"],
      flowId("support_case"),
      [nodeId("triage")],
      (request) => {
        requests.push(request.dataset_item_id ?? "")
        expect(request.selected_nodes).toEqual(["triage"])
        if (request.dataset_item_id === "support_case_cases/second") throw new Error("provider unavailable")
        return Promise.resolve({ run_id: `run-${String(requests.length)}` })
      },
    )
    expect(requests).toEqual([
      "support_case_cases/first",
      "support_case_cases/second",
      "support_case_cases/third",
    ])
    expect(results).toEqual([
      { caseName: "first", runId: "run-1", error: null },
      { caseName: "second", runId: null, error: "provider unavailable" },
      { caseName: "third", runId: "run-3", error: null },
    ])
  })
})
