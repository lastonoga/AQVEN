import { describe, expect, it } from "vitest"
import type { ApiExecution, ApiItemRecovery, ApiRunSnapshot } from "@/domain"
import { recoveredRunSnapshot } from "@/mocks/data/recovered-run"
import { nodeFailures } from "./node-failures"
import { completedSnapshot, execution, topAddress } from "./test-support"

const recovery = (itemIndex: number, decision: ApiItemRecovery["decision"]): ApiItemRecovery => ({
  item_index: itemIndex,
  policy: "@root.code.policies:fallback",
  decision,
  error: { code: "MODEL_RETRIES_EXHAUSTED", message: "no valid output" },
  default_ref: decision === "skip" ? null : { kind: "inline", value: { skipped: true } },
})

const item = (itemIndex: number, status: ApiExecution["status"]): ApiExecution =>
  execution("scan__look", { address: { ...topAddress("scan__look"), item_index: itemIndex }, status })

const snapshotOf = (executions: readonly ApiExecution[]): ApiRunSnapshot => ({
  ...completedSnapshot(),
  node_counts: { pending: 0, running: 0, ok: 0, failed: executions.filter((entry) => entry.status === "failed").length, skipped: 0, suspended: 0, cancelled: 0 },
  executions: [...executions],
})

const mapWith = (recoveries: readonly ApiItemRecovery[]): ApiExecution =>
  execution("scan", { kind: "map", degraded: recoveries.length > 0, recovered_items: [...recoveries] })

describe("nodeFailures", () => {
  it("reports no failures when no node failed", () => {
    expect(nodeFailures(snapshotOf([mapWith([]), item(0, "ok")]))).toEqual({ kind: "none" })
  })

  it("keeps an old run without recovered items as failed nodes", () => {
    expect(nodeFailures(completedSnapshot())).toEqual({ kind: "failed", count: 1 })
  })

  it("counts replaced items when every failed execution is a recovered map item", () => {
    expect(nodeFailures(recoveredRunSnapshot)).toEqual({ kind: "recovered", count: 1, decision: "default" })
  })

  it("says skipped when the policy skipped every failed item", () => {
    const run = snapshotOf([mapWith([recovery(1, "skip"), recovery(3, "skip")]), item(1, "failed"), item(3, "failed")])
    expect(nodeFailures(run)).toEqual({ kind: "recovered", count: 2, decision: "skip" })
  })

  it("says recovered when the policy replaced some items and skipped others", () => {
    const run = snapshotOf([mapWith([recovery(1, "default"), recovery(3, "skip")]), item(1, "failed"), item(3, "failed")])
    expect(nodeFailures(run)).toEqual({ kind: "recovered", count: 2, decision: "mixed" })
  })

  it("keeps the failed nodes when any failure was not recovered", () => {
    const run = snapshotOf([mapWith([recovery(1, "default")]), item(1, "failed"), item(3, "failed")])
    expect(nodeFailures(run)).toEqual({ kind: "failed", count: 2 })
  })
})
