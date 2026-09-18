import { describe, expect, it } from "vitest"
import { legendRows, type LegendLabels } from "./legend-rows"

const LABELS: LegendLabels = {
  container: "container holds its body",
  loopBackEdge: "loop back edge",
  dependencies: "data dependency",
  problems: "node has problems",
}

describe("legendRows", () => {
  const rows = legendRows(LABELS)

  it("explains the four canvas signs", () => {
    expect(rows).toHaveLength(4)
  })

  it("names every container kind from the shared kind table", () => {
    expect(rows[0]).toEqual([{ text: "PAR MAP SWITCH LOOP", tone: "neutral" }, { text: " " }, { text: "container holds its body" }])
  })

  it("tones the loop and problem glyphs", () => {
    expect(rows[1]).toEqual([{ text: "┄", tone: "loop" }, { text: " " }, { text: "loop back edge" }])
    expect(rows[3]).toEqual([{ text: "●", tone: "destructive" }, { text: " " }, { text: "node has problems" }])
  })
})
