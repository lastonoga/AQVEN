import { describe, expect, it } from "vitest"
import type { DatasetRow, RunHistory } from "@/domain"
import { callId, datasetId, revisionId, rowId } from "@/data/ids"
import { datasetMeta, datasetValue, failureCount, RESULT_VALUE, valueTrack } from "./dataset"
import { filterFailures, rowMatches, rowNavigation, selectRowSearch } from "./navigation"
import { promptSourceNote, runChips, scopeLine, summaryMetrics, targetTag, totalDuration } from "./summary"
import { datasetRow, pitchTestDetail, testDetailT } from "./test-support"

const ROWS: readonly DatasetRow[] = [
  datasetRow("07", 7, "fail"),
  datasetRow("12", 12, "pass"),
  datasetRow("19", 19, "fail"),
  datasetRow("24", 24, "pass"),
  datasetRow("33", 33, "fail"),
]

const rowAt = (index: number): DatasetRow => {
  const row = ROWS[index]
  if (row === undefined) throw new Error(`no row ${String(index)}`)
  return row
}

const quote = (text: string): string => `“${text}”`

describe("rowNavigation", () => {
  it("steps through dataset order and wraps around", () => {
    expect(rowNavigation(ROWS, rowAt(0), false)).toEqual({ previous: "33", next: "12", nextFailure: "19" })
    expect(rowNavigation(ROWS, rowAt(4), false)).toEqual({ previous: "24", next: "07", nextFailure: "07" })
  })

  it("keeps only failing rows in the order when failures are filtered", () => {
    expect(rowNavigation(ROWS, rowAt(2), true)).toEqual({ previous: "07", next: "33", nextFailure: "33" })
  })

  it("positions a passing row between failures when it is outside the filtered order", () => {
    expect(rowNavigation(ROWS, rowAt(1), true)).toEqual({ previous: "07", next: "19", nextFailure: "19" })
  })

  it("returns no target when the only candidate is the current row", () => {
    const failing = datasetRow("04", 4, "fail")
    expect(rowNavigation([failing, datasetRow("07", 7, "pass")], failing, true)).toEqual({ previous: null, next: null, nextFailure: null })
  })

  it("filters verdicted items", () => {
    expect(filterFailures(ROWS, true).map((row) => row.id)).toEqual(["07", "19", "33"])
    expect(filterFailures(ROWS, false)).toBe(ROWS)
  })

  it("selects a row and closes the call sheet", () => {
    const search = { row: rowId("07"), failures: true, call: callId("call_01HT9"), callTab: "prompt" as const }
    expect(selectRowSearch(rowId("12"))(search)).toEqual({ row: "12", failures: true, callTab: "model" })
  })

  it("matches picker rows by id or hotel as a substring", () => {
    expect(rowMatches("#19", "Sea", ["Sea Galaxy"])).toBe(1)
    expect(rowMatches("#07", "sea", ["Marins Park"])).toBe(0)
    expect(rowMatches("#07", "07")).toBe(1)
  })
})

describe("dataset presenters", () => {
  it("derives the track and alignment from the values", () => {
    const rows = [
      { ...datasetRow("01", 1, "pass"), values: { rating: 4.8, hotel: "Marins" } },
      { ...datasetRow("02", 2, "pass"), values: { rating: 3.9, hotel: "Rodina" } },
    ]
    expect(valueTrack(rows, "rating")).toEqual({ track: "minmax(0,0.6fr)", align: "end" })
    expect(valueTrack(rows, "hotel")).toEqual({ track: "minmax(0,1fr)", align: "start" })
    expect(valueTrack([], "rating")).toEqual({ track: "minmax(0,1fr)", align: "start" })
  })

  it("formats dataset values", () => {
    expect(datasetValue("beach_m", 240, quote)).toBe("240")
    expect(datasetValue("rating", 3.9, quote)).toBe("3.9")
    expect(datasetValue("expected.title", "A holiday next to the park", quote)).toBe("“A holiday next to the park”")
    expect(datasetValue("persona", "family", quote)).toBe("family")
    expect(datasetValue("missing", undefined, quote)).toBe("")
  })

  it("describes the dataset source", () => {
    const detail = pitchTestDetail("pitch_gen_b")
    expect(datasetMeta(detail.dataset, testDetailT)).toBe("48 rows · 3 assertions · source: spreadsheet, agent-extended")
    const tool = { ...detail.dataset, id: datasetId("hotels_500"), rowCount: 500, assertionCount: 1, source: { kind: "tool", adapter: "hotels.search" } as const }
    expect(datasetMeta(tool, testDetailT)).toBe("500 rows · 1 assertion · source: tool hotels.search")
    expect(failureCount(detail.summary)).toBe(4)
  })

  it("formats the per-row result columns", () => {
    const result = pitchTestDetail("pitch_gen_b").results[0]
    expect(result === undefined ? [] : [RESULT_VALUE.iterations(result), RESULT_VALUE.calls(result), RESULT_VALUE.cost(result), RESULT_VALUE.time(result), RESULT_VALUE.delta(result)]).toEqual(["3", "11", "0.1672", "7.9 s", "0.22"])
  })
})

describe("summary presenters", () => {
  it("renders the designed summary strings", () => {
    const detail = pitchTestDetail("pitch_gen_b")
    expect(summaryMetrics(detail.summary, testDetailT).map((metric) => [metric.label, metric.value])).toEqual([
      ["Rows", "48"],
      ["Pass", "44 / 48"],
      ["Cost", "$0.6104"],
      ["Time", "92 s"],
      ["Δ vs previous", "+3 pass"],
    ])
    expect(scopeLine(detail, testDetailT)).toBe("stage 4 · divergence · ancestors frozen (4 nodes replay recorded outputs)")
    expect(promptSourceNote(detail.promptSource, testDetailT)).toBe("prompt from draft r42 · no cassette")
    expect(targetTag(detail.target)).toEqual({ tone: "llm", size: "sm", fill: "soft", children: "LLM pitch_gen_b" })
  })

  it("formats durations and signed counts", () => {
    expect(totalDuration(92)).toBe("92 s")
    expect(totalDuration(7.9)).toBe("7.9 s")
  })

  it("words the scope without frozen ancestors", () => {
    expect(scopeLine(pitchTestDetail("whole_workflow"), testDetailT)).toBe("stage 1 · data load · no frozen ancestors")
  })

  it("builds the dataset run chips with a trend tone", () => {
    const history = pitchTestDetail("pitch_gen_b").runHistory
    expect(runChips(history, testDetailT)).toEqual({
      previous: { label: "r41 · 41/48 · $0.58", tone: "neutral", fill: "outline" },
      current: { label: "r42 draft · 44/48 · $0.61", tone: "success", fill: "soft" },
    })
    const regressed: RunHistory = { ...history, current: { revision: revisionId("r43"), draft: false, pass: { passed: 40, total: 48 }, costUsd: 0.6 } }
    expect(runChips(regressed, testDetailT).current).toEqual({ label: "r43 · 40/48 · $0.60", tone: "destructive", fill: "soft" })
  })
})
