import { describe, expect, it } from "vitest"
import type { ApiExecution, ApiRunEvent, ApiRunSnapshot } from "@/domain"
import { TEST_NOW } from "@/test/clock"
import { diffRuns, type RunSide } from "./run-diff"
import { completedSnapshot, execution, topAddress } from "./test-support"

const snapshotWith = (runId: string, executions: readonly ApiExecution[], patch: Partial<ApiRunSnapshot> = {}): ApiRunSnapshot => ({
  ...completedSnapshot(),
  run_id: runId,
  executions: [...executions],
  output_ref: { kind: "inline", value: { status: "resolved" } },
  ...patch,
})

const side = (snapshot: ApiRunSnapshot, events: readonly ApiRunEvent[] = []): RunSide => ({ snapshot, events, blobs: [] })

const checks = (runId: string, nodeId: string, passed: boolean): ApiRunEvent => ({
  seq: 1,
  at: "2026-09-18T02:00:01Z",
  run_id: runId,
  type: "inference_checks_captured",
  address: topAddress(nodeId),
  checks: [{ check: "grounded", on_fail: "retry", passed, feedback: null, attempt: 1 }],
})

describe("diffRuns", () => {
  it("compares every execution by address on input, output, model, cost and checks", () => {
    const left = snapshotWith("run-a", [execution("triage"), execution("polish"), execution("finalize", { kind: "code", agent: null, model: null })])
    const right = snapshotWith("run-b", [
      execution("triage", { agent: "mistral", model: "mistral/large", cost_usd: "0.0200" }),
      execution("polish", { output_ref: { kind: "inline", value: { intent: "defect", tier: "weak" } } }),
      execution("illustrate"),
    ], { output_ref: { kind: "inline", value: { status: "rejected" } } })

    const diff = diffRuns(side(left, [checks("run-a", "polish", true)]), side(right, [checks("run-b", "polish", false)]), TEST_NOW)

    expect(diff.nodes.map((node) => node.nodeId)).toEqual(["triage", "polish", "finalize", "illustrate"])
    const [triage, polish, finalize, illustrate] = diff.nodes
    expect(triage?.facts).toEqual({ status: "same", model: "changed", cost: "changed", checks: "same" })
    expect(triage?.input).toEqual([])
    expect(triage?.sameInput).toBe(1)
    expect(polish?.facts.checks).toBe("changed")
    expect(polish?.left?.checks).toEqual([{ name: "grounded", passed: true }])
    expect(polish?.output).toEqual([{ path: "tier", left: "strong", right: "weak", state: "changed" }])
    expect(polish?.sameOutput).toBe(1)
    expect(finalize?.right).toBeNull()
    expect(finalize?.facts.status).toBe("onlyLeft")
    expect(illustrate?.left).toBeNull()
    expect(illustrate?.facts.model).toBe("onlyRight")
    expect(diff.output).toEqual([{ path: "status", left: "resolved", right: "rejected", state: "changed" }])
  })

  it("does not count a cost-only difference as a changed execution", () => {
    const left = snapshotWith("run-a", [execution("triage"), execution("polish")])
    const right = snapshotWith("run-b", [execution("triage", { cost_usd: "0.0300" }), execution("polish")])
    const diff = diffRuns(side(left), side(right), TEST_NOW)
    expect(diff.changedNodes).toEqual([])
    expect(diff.sameNodes.map((node) => node.nodeId)).toEqual(["triage", "polish"])
    expect(diff.sameNodes[0]?.facts.cost).toBe("changed")
    expect(diff.output).toEqual([])
    expect(diff.sameOutput).toBe(1)
  })

  it("reports the totals of both runs", () => {
    const left = snapshotWith("run-a", [], { cost_usd: "0.5", tokens_in: 3, tokens_out: 4 })
    const right = snapshotWith("run-b", [], { status: "failed", cost_usd: "0.25", finished_at: null })
    const diff = diffRuns(side(left), side(right), TEST_NOW)
    expect(diff.left).toMatchObject({ status: "completed", costUsd: 0.5, tokensIn: 3, tokensOut: 4 })
    expect(diff.right).toMatchObject({ status: "failed", costUsd: 0.25 })
    expect(diff.right.durationMs).toBeGreaterThan(diff.left.durationMs ?? 0)
  })
})
