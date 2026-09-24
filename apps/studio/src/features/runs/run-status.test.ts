import { describe, expect, it } from "vitest"
import type { ApiNodeCounts } from "@/domain"
import { runStatusLook } from "./run-status"

const counts = (failed: number): ApiNodeCounts => ({ pending: 0, running: 0, ok: 4, failed, skipped: 0, suspended: 0, cancelled: 0 })

describe("runStatusLook", () => {
  it("marks a completed run with absorbed failures as a warning, not a success", () => {
    expect(runStatusLook("completed", counts(2))).toEqual({ kind: "partial", failed: 2, tone: "warning" })
  })

  it("keeps a clean completed run green", () => {
    expect(runStatusLook("completed", counts(0))).toEqual({ kind: "plain", status: "completed", tone: "success" })
  })

  it("leaves a failed run on its own status and tone", () => {
    expect(runStatusLook("failed", counts(1))).toEqual({ kind: "plain", status: "failed", tone: "destructive" })
  })

  it("does not count failures of a run that is still going", () => {
    expect(runStatusLook("running", counts(1))).toEqual({ kind: "plain", status: "running", tone: "primary" })
  })
})
