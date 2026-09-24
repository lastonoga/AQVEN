import { describe, expect, it } from "vitest"
import type { ApiNodeCounts } from "@/domain"
import { runStatusLook } from "./run-status"

const counts = (failed: number): ApiNodeCounts => ({ pending: 0, running: 0, ok: 4, failed, skipped: 0, suspended: 0, cancelled: 0, items_replaced: 0, items_skipped: 0 })

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

  it("names the items a map policy replaced instead of counting them as failed steps", () => {
    expect(runStatusLook("completed", { ...counts(1), items_replaced: 1 })).toEqual({ kind: "recovered", count: 1, decision: "default", tone: "warning" })
  })

  it("names skipped items and mixes skipped with replaced ones", () => {
    expect(runStatusLook("completed", { ...counts(2), items_skipped: 2 })).toEqual({ kind: "recovered", count: 2, decision: "skip", tone: "warning" })
    expect(runStatusLook("completed", { ...counts(2), items_replaced: 1, items_skipped: 1 })).toEqual({ kind: "recovered", count: 2, decision: "mixed", tone: "warning" })
  })

  it("keeps counting failed steps when some failures were not recovered", () => {
    expect(runStatusLook("completed", { ...counts(3), items_replaced: 1 })).toEqual({ kind: "partial", failed: 3, tone: "warning" })
  })

  it("does not count failures of a run that is still going", () => {
    expect(runStatusLook("running", counts(1))).toEqual({ kind: "plain", status: "running", tone: "primary" })
  })
})
