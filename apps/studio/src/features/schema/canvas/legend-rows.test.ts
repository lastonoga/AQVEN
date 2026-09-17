import { describe, expect, it } from "vitest"
import { legendRows, type LegendLabels } from "./legend-rows"

const LABELS: LegendLabels = {
  allBranches: "all branches at once",
  oneBranch: "exactly one branch",
  loopBackEdge: "loop back edge",
  map: "map, count from runtime",
  provenance: (kind) => kind,
}

describe("legendRows", () => {
  const rows = legendRows(LABELS)

  it("orders the six legend entries row by row", () => {
    expect(rows).toHaveLength(6)
    expect(rows[3]).toBe("×N · map, count from runtime")
  })

  it("tones only the gateway and loop glyphs", () => {
    expect(rows[0]).toEqual([{ text: "◆ +", tone: "llm" }, { text: " " }, { text: "all branches at once" }])
    expect(rows[1]).toEqual([{ text: "◆ ×", tone: "warning" }, { text: " " }, { text: "exactly one branch" }])
    expect(rows[2]).toEqual([{ text: "⟳ ┄", tone: "loop" }, { text: " " }, { text: "loop back edge" }])
  })

  it("renders provenance rows as untoned glyph text in the row font", () => {
    expect(rows[4]).toBe("▪ static ▤ data ▦ knowledge")
    expect(rows[5]).toBe("✦ generated ◌ human")
  })
})
