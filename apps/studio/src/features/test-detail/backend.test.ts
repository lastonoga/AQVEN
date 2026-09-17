import { describe, expect, it } from "vitest"
import type { CallColumn, RowTrace, TestDetail } from "@/domain"
import { callDetails } from "@/mocks/data/calls"
import { WORKFLOWS, workflowKey } from "@/mocks/data/keys"
import { rowTraces, testDetails } from "@/mocks/data/test-detail"
import { testsOverviews } from "@/mocks/data/tests"

const USD_UNITS = 10_000
const TENTHS = 10

const pitchTests = testsOverviews[workflowKey(WORKFLOWS.pitchPipeline)]?.tests ?? []
const details: readonly TestDetail[] = Object.values(testDetails)

const units = (value: number): number => Math.round(value * USD_UNITS)
const tenths = (value: number): number => Math.round(value * TENTHS)

const traceOf = (detail: TestDetail, row: string): RowTrace | undefined => rowTraces[workflowKey(WORKFLOWS.pitchPipeline, detail.id, row)]

const DESIGNED_ROW = "pitch_gen_b/07"

const traceColumns = (trace: RowTrace): readonly CallColumn[] => trace.steps.flatMap((step) => step.groups.flatMap((group) => group.columns))

const traceCallIds = (trace: RowTrace): readonly string[] => traceColumns(trace).map((column) => column.callId)

describe("test detail mock backend", () => {
  it("has a detail for every test the tests list links to", () => {
    const served = pitchTests.map((test) => testDetails[workflowKey(WORKFLOWS.pitchPipeline, test.id)])
    expect(pitchTests.length).toBeGreaterThan(0)
    expect(served.map((detail) => detail?.id)).toEqual(pitchTests.map((test) => test.id))
  })

  it("agrees with the tests overview on dataset and pass ratio", () => {
    const mismatched = pitchTests.filter((test) => {
      const detail = testDetails[workflowKey(WORKFLOWS.pitchPipeline, test.id)]
      return detail?.dataset.id !== test.datasetId || detail.summary.passed !== test.pass.passed || detail.summary.rows !== test.pass.total
    })
    expect(mismatched.map((test) => test.id)).toEqual([])
  })

  it("has a non-empty trace for every navigable dataset row", () => {
    const missing = details.flatMap((detail) =>
      detail.dataset.rows.flatMap((row) => ((traceOf(detail, row.id)?.steps.length ?? 0) > 0 ? [] : [`${detail.id}/${row.id}`])),
    )
    expect(missing).toEqual([])
  })

  it("keeps rows, results and traces consistent", () => {
    const problems = details.flatMap((detail) =>
      detail.dataset.rows.flatMap((row, index) => {
        const result = detail.results[index]
        const trace = traceOf(detail, row.id)
        const checks = [
          result?.rowId === row.id,
          result?.verdict === row.verdict,
          trace?.outcome.verdict === row.verdict,
          trace !== undefined && result !== undefined && units(trace.outcome.totalCostUsd) === units(result.costUsd),
          trace?.outcome.calls === result?.calls,
          row.context.length > 0,
        ]
        return checks.every(Boolean) ? [] : [`${detail.id}/${row.id}`]
      }),
    )
    expect(problems).toEqual([])
  })

  it("sums step costs and durations into the row result", () => {
    const problems = details.flatMap((detail) =>
      detail.results.flatMap((result) => {
        const steps = traceOf(detail, result.rowId)?.steps ?? []
        const cost = steps.reduce((sum, step) => sum + units(step.costUsd), 0)
        const duration = steps.reduce((sum, step) => sum + tenths(step.durationS ?? 0), 0)
        return cost === units(result.costUsd) && duration === tenths(result.durationS) ? [] : [`${detail.id}/${result.rowId}`]
      }),
    )
    expect(problems).toEqual([])
  })

  it("counts every call of a generated trace in the row result", () => {
    const problems = details.flatMap((detail) =>
      detail.results.flatMap((result) => {
        const trace = traceOf(detail, result.rowId)
        if (trace === undefined || `${detail.id}/${result.rowId}` === DESIGNED_ROW) return []
        const calls = traceColumns(trace).reduce((sum, column) => sum + (column.agent?.calls ?? 1), 0)
        return calls === result.calls && calls === trace.outcome.calls ? [] : [`${detail.id}/${result.rowId}`]
      }),
    )
    expect(problems).toEqual([])
  })

  it("selects the result branch in every join", () => {
    const problems = details.flatMap((detail) =>
      detail.results.flatMap((result) => {
        const joins = (traceOf(detail, result.rowId)?.steps ?? []).flatMap((step) => (step.join === undefined ? [] : [step.join]))
        return joins.every((join) => join.selected === result.selectedBranch) ? [] : [`${detail.id}/${result.rowId}`]
      }),
    )
    expect(problems).toEqual([])
  })

  it("keeps the designed row 07 trace and derives the navigator from the dataset row", () => {
    const detail = testDetails[workflowKey(WORKFLOWS.pitchPipeline, "pitch_gen_b")]
    const row = detail?.dataset.rows[0]
    expect(row?.context).toEqual(["Marins", "family", "beach 2.1 km"])
    const trace = rowTraces[workflowKey(WORKFLOWS.pitchPipeline, "pitch_gen_b", "07")]
    expect(trace?.steps.map((step) => [step.title, step.costUsd, step.durationS])).toEqual([
      ["Pitch divergence", 0.0471, 2.4],
      ["Critic loop", 0.1201, 5.5],
    ])
    expect(trace?.outcome).toEqual({ verdict: "fail", failedAssertion: "hooks[*] non-empty", branch: "b", totalCostUsd: 0.1672, calls: 11 })
    expect(trace === undefined ? [] : traceCallIds(trace)).toContain("call_01HT9")
  })

  it("uses call ids that are unique across traces and open a call detail", () => {
    const ids = Object.values(rowTraces).flatMap(traceCallIds)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((id) => callDetails[workflowKey(WORKFLOWS.pitchPipeline, id)] === undefined)).toEqual([])
  })
})
