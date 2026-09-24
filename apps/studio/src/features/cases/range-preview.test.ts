import { describe, expect, it } from "vitest"
import { blockerNames, blockersOf, blockerText, isWhole, wholeSpan, withEnd, withStart } from "./range-preview"

const ORDER = ["prepare", "triage", "vote"]

const missing = (caseName: string, reference: string) => ({ case_name: caseName, reference, reason: `output fixture for ${reference} is missing` })

describe("range preview", () => {
  it("spans the whole flow by default and knows when a span is narrower", () => {
    expect(wholeSpan(ORDER)).toEqual([0, 2])
    expect(wholeSpan([])).toEqual([0, 0])
    expect(isWhole([0, 2], ORDER)).toBe(true)
    expect(isWhole([1, 2], ORDER)).toBe(false)
    expect(isWhole([0, 1], ORDER)).toBe(false)
  })

  it("moves the other end along when a pick would invert the span", () => {
    expect(withStart([0, 1], 2)).toEqual([2, 2])
    expect(withStart([0, 2], 1)).toEqual([1, 2])
    expect(withEnd([2, 2], 0)).toEqual([0, 0])
    expect(withEnd([0, 1], 2)).toEqual([0, 2])
  })

  it("names each blocking case once with the saved outputs it lacks", () => {
    const blockers = blockersOf([
      missing("strip_flicker_credit", "$prepare.out"),
      missing("strip_flicker_credit", "$triage.out"),
      missing("lamp_crushed_box_reship", "$prepare.out"),
      missing("strip_flicker_credit", "$prepare.out"),
    ])
    expect(blockers).toEqual([
      { caseName: "strip_flicker_credit", references: ["$prepare.out", "$triage.out"] },
      { caseName: "lamp_crushed_box_reship", references: ["$prepare.out"] },
    ])
    expect(blockerText(blockers)).toBe("strip_flicker_credit ($prepare.out, $triage.out); lamp_crushed_box_reship ($prepare.out)")
    expect(blockerNames(blockers)).toBe("strip_flicker_credit, lamp_crushed_box_reship")
    expect(blockersOf([])).toEqual([])
  })
})
