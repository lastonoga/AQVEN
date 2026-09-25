import { describe, expect, it } from "vitest"
import { ApiError } from "@/api/client"
import { diagnosticRows, hasErrors, problemRows, writeFailureOf } from "./write-outcome"

const apiError = (status: number, code: string) =>
  new ApiError(status, { op: "experiment_cases_write", code, message: `${code} happened`, problems: [{ path: ["cases", "dataset"], code: "E_X", message: "bad" }], retryAfterMs: null })

describe("write outcome", () => {
  it("sorts a refused write by what the author can do about it", () => {
    expect(writeFailureOf(apiError(412, "STALE_FILE")).kind).toBe("stale")
    expect(writeFailureOf(apiError(412, "FILE_VANISHED")).kind).toBe("stale")
    expect(writeFailureOf(apiError(412, "FILE_EXISTS")).kind).toBe("exists")
    expect(writeFailureOf(apiError(409, "TREE_DIRTY")).kind).toBe("failed")
    expect(writeFailureOf(apiError(422, "REQUEST_INVALID")).kind).toBe("invalid")
    expect(writeFailureOf(apiError(422, "BLOCKING_PROBLEMS")).kind).toBe("invalid")
    expect(writeFailureOf(apiError(500, "INTERNAL")).kind).toBe("failed")
    expect(writeFailureOf(new Error("offline"))).toEqual({ kind: "failed", message: "offline", problems: [] })
    expect(writeFailureOf(apiError(422, "REQUEST_INVALID")).problems).toEqual([{ path: ["cases", "dataset"], code: "E_X", message: "bad" }])
  })

  it("lists diagnostics and problems with where they point", () => {
    const rows = diagnosticRows([
      { code: "E_CASES_EMPTY", severity: "error", file: "experiments/x/experiment.yaml", path: ["cases", "tags"], message: "empty", line: 7, hint: "drop a tag" },
      { code: "W_PLAN_EXCEEDS_CASES", severity: "warning", file: "experiments/x/experiment.yaml", path: [], message: "short", line: null, hint: null },
    ])
    expect(rows.map((row) => row.where)).toEqual(["experiments/x/experiment.yaml:7 · cases.tags", "experiments/x/experiment.yaml"])
    expect(rows.map((row) => row.hint)).toEqual(["drop a tag", null])
    expect(problemRows([{ path: ["spec", "variants", 0, "id"], code: "missing", message: "an id" }])[0]?.where).toBe("spec.variants.0.id")
    expect(problemRows([{ path: ["body", "spec", "question", "margin"], code: "greater_than", message: "above 0" }])[0]?.where).toBe("spec.question.margin")
    expect(problemRows([{ path: ["experiments/x/experiment.yaml", "cases", "dataset"], code: "E_DATASET_MISMATCH", message: "another flow" }])[0]?.where).toBe(
      "experiments/x/experiment.yaml · cases.dataset",
    )
    expect(hasErrors([{ code: "W", severity: "warning", file: "f", path: [], message: "m", line: null, hint: null }])).toBe(false)
  })
})
