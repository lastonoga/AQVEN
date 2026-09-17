import { describe, expect, it } from "vitest"
import { columnsMinWidth, columnsTemplate, isGround, resolvePaint, rowsTemplate } from "./matrix-layout"

describe("rowsTemplate", () => {
  it("uses each field track and falls back to a shrinkable fraction", () => {
    expect(rowsTemplate(["96px", undefined, "minmax(0,1.4fr)"])).toBe("96px minmax(0,1fr) minmax(0,1.4fr)")
  })
})

describe("columnsTemplate", () => {
  it("puts the label track before repeated item tracks", () => {
    expect(columnsTemplate(128, 4, 170, false)).toBe("128px repeat(4, minmax(170px, 1fr))")
  })

  it("appends one item-sized track for the trailing summary column", () => {
    expect(columnsTemplate(96, 2, 210, true)).toBe("96px repeat(2, minmax(210px, 1fr)) minmax(210px, 1fr)")
  })

  it("never emits an invalid zero repeat", () => {
    expect(columnsTemplate(128, 0, 170, false)).toBe("128px")
  })
})

describe("columnsMinWidth", () => {
  it("adds one hairline per item track to the label width", () => {
    expect(columnsMinWidth(128, 4, 170, false)).toBe(128 + 4 * 171)
  })

  it("counts the trailing column as an item track", () => {
    expect(columnsMinWidth(128, 4, 170, true)).toBe(128 + 5 * 171)
  })
})

describe("resolvePaint", () => {
  it("keeps the field ground when nothing paints", () => {
    expect(resolvePaint("card", {}, {})).toEqual({ surface: "card", accent: undefined })
    expect(resolvePaint("subtle", {}, {})).toEqual({ surface: "subtle", accent: undefined })
  })

  it("lets the item surface override only card-ground fields", () => {
    expect(resolvePaint("card", { surface: "destructive" }, {}).surface).toBe("destructive")
    expect(resolvePaint("subtle", { surface: "destructive" }, {}).surface).toBe("subtle")
    expect(resolvePaint("none", { surface: "neutral" }, {}).surface).toBe("none")
  })

  it("lets the field paint win over the item paint and the ground", () => {
    expect(resolvePaint("card", { surface: "destructive" }, { surface: "llm" }).surface).toBe("llm")
    expect(resolvePaint("subtle", {}, { surface: "subtle" }).surface).toBe("subtle")
  })

  it("keeps the accent independent of the surface tone", () => {
    expect(resolvePaint("card", { surface: "success" }, { accent: "destructive" })).toEqual({ surface: "success", accent: "destructive" })
    expect(resolvePaint("card", { accent: "loop" }, {}).accent).toBe("loop")
  })
})

describe("isGround", () => {
  it("separates grounds from tones", () => {
    expect(isGround("card")).toBe(true)
    expect(isGround("none")).toBe(true)
    expect(isGround("neutral")).toBe(false)
  })
})
