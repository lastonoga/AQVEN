import { describe, expect, it } from "vitest"
import { stepBounds, stepNumber } from "./number-step"

describe("number step", () => {
  it("steps a whole number and keeps it within the bounds", () => {
    expect(stepNumber("6", 1, 1, 20)).toBe("7")
    expect(stepNumber("20", 1, 1, 20)).toBe("20")
    expect(stepNumber("1", -1, 1, 20)).toBe("1")
    expect(stepNumber("25", -1, 1, 20)).toBe("20")
  })

  it("starts from the minimum when the text is not a number", () => {
    expect(stepNumber("", 1, 1, 20)).toBe("1")
    expect(stepNumber("abc", -1, 1, 20)).toBe("1")
  })

  it("knows when a value sits at either end", () => {
    expect(stepBounds("1", 1, 20)).toEqual({ atMin: true, atMax: false })
    expect(stepBounds("20", 1, 20)).toEqual({ atMin: false, atMax: true })
    expect(stepBounds("", 1, 20)).toEqual({ atMin: false, atMax: false })
  })
})
