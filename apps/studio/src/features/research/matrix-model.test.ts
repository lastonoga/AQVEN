import { describe, expect, it } from "vitest"
import type { ExperimentQuestion, MatrixRow, MetricColumn } from "@/domain"
import * as ids from "@/data/ids"
import { columnMarks, columnScale, matrixColumns, positionOf, stabilityShares, whiskerOf } from "./matrix-model"
import { seriesDetail } from "./test-support"

const LABEL: MetricColumn = { id: ids.checkId("label"), role: "primary", direction: "higher_is_better", unit: "rate", margin: 0.05, relative: false }
const COST: MetricColumn = { id: "cost_usd", role: "builtin", direction: "lower_is_better", unit: "usd", margin: null, relative: false }

const row = (variant: string, cells: MatrixRow["cells"]): MatrixRow => ({ variant: ids.variantId(variant), role: "candidate", cells })

describe("shared column scale", () => {
  it("spans every value and interval of the column with a margin and stays inside the unit bounds", () => {
    const rows = [
      row("a", [{ metric: LABEL.id, value: 0.9, ciLow: 0.8, ciHigh: 0.98, verdict: "pass" }]),
      row("b", [{ metric: LABEL.id, value: 0.5, ciLow: 0.3, ciHigh: 0.7, verdict: "fail" }]),
    ]
    const scale = columnScale(LABEL, rows, [])
    expect(scale?.low).toBeCloseTo(0.2456)
    expect(scale?.high).toBe(1)
  })

  it("includes the threshold of the question and pads a single value", () => {
    const rows = [row("a", [{ metric: COST.id, value: 0.002, ciLow: null, ciHigh: null, verdict: "none" }])]
    const single = columnScale(COST, rows, [])
    expect(single?.low).toBeCloseTo(0.0015)
    expect(single?.high).toBeCloseTo(0.0025)
    const threshold = columnScale(LABEL, [row("a", [{ metric: LABEL.id, value: 0.83, ciLow: 0.66, ciHigh: 0.93, verdict: "unclear" }])], [0.85])
    expect(threshold?.low).toBeCloseTo(0.6384)
    expect(threshold?.high).toBeCloseTo(0.9516)
  })

  it("has no scale when the column has no value yet", () => {
    expect(columnScale(LABEL, [row("a", [{ metric: LABEL.id, value: null, ciLow: null, ciHigh: null, verdict: "none" }])], [])).toBeNull()
  })

  it("marks the threshold only on the primary column of a threshold question", () => {
    const question: ExperimentQuestion = { kind: "threshold", metric: LABEL.id, bound: "above", value: 0.85, margin: 0.05, variant: null }
    expect(columnMarks(question, LABEL)).toEqual([0.85])
    expect(columnMarks(question, COST)).toEqual([])
    expect(columnMarks({ kind: "look" }, LABEL)).toEqual([])
  })
})

describe("whisker", () => {
  it("places the point and the interval in percent of the column scale", () => {
    const scale = { low: 0, high: 1 }
    expect(whiskerOf({ metric: LABEL.id, value: 0.5, ciLow: 0.25, ciHigh: 0.75, verdict: "pass" }, scale)).toEqual({ point: 50, low: 25, high: 75 })
    expect(whiskerOf({ metric: LABEL.id, value: 0.5, ciLow: null, ciHigh: null, verdict: "none" }, scale)).toEqual({ point: 50, low: null, high: null })
    expect(whiskerOf({ metric: LABEL.id, value: null, ciLow: null, ciHigh: null, verdict: "none" }, scale)).toBeNull()
    expect(whiskerOf(undefined, scale)).toBeNull()
  })

  it("keeps positions inside the track", () => {
    expect(positionOf(2, { low: 0, high: 1 })).toBe(100)
    expect(positionOf(-1, { low: 0, high: 1 })).toBe(0)
    expect(positionOf(3, { low: 3, high: 3 })).toBe(50)
  })

  it("builds one view per column of the series matrix", () => {
    const views = matrixColumns(seriesDetail({}).matrix, seriesDetail({}).question)
    expect(views).toHaveLength(1)
    expect(views[0]?.marks).toEqual([])
    expect(views[0]?.scale?.low).toBeCloseTo(0.468)
  })
})

describe("stability", () => {
  it("splits the cases of a variant into always, flaky and never shares", () => {
    expect(stabilityShares({ variant: ids.variantId("gpt"), always: 6, flaky: 3, never: 3 })).toEqual([
      { kind: "always", count: 6, share: 50 },
      { kind: "flaky", count: 3, share: 25 },
      { kind: "never", count: 3, share: 25 },
    ])
    expect(stabilityShares({ variant: ids.variantId("gpt"), always: 0, flaky: 0, never: 0 }).map((share) => share.share)).toEqual([0, 0, 0])
  })
})
