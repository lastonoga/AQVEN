import { describe, expect, it } from "vitest"
import { labelTransform, pointsGeometry, pointsPath } from "./edge-paths"

describe("pointsPath", () => {
  it("draws a straight line between two points", () => {
    expect(pointsPath([{ x: 10, y: 20 }, { x: 110, y: 20 }])).toBe("M 10 20 L 110 20")
  })

  it("rounds an orthogonal corner", () => {
    expect(pointsPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }], 12)).toBe("M 0 0 L 88 0 Q 100 0 100 12 L 100 50")
  })

  it("shrinks the corner radius when a segment is short", () => {
    expect(pointsPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 10 }], 12)).toBe("M 0 0 L 95 0 Q 100 0 100 5 L 100 10")
  })

  it("keeps a zero-length bend as a plain line to it", () => {
    expect(pointsPath([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 0 }])).toBe("M 0 0 L 0 0 L 50 0")
  })

  it("returns only the move command for a single point and nothing for none", () => {
    expect(pointsPath([{ x: 5, y: 6 }])).toBe("M 5 6")
    expect(pointsPath([])).toBe("")
  })
})

describe("pointsGeometry", () => {
  it("places flow labels above the middle of the path", () => {
    const geometry = pointsGeometry([{ x: 0, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 40 }], "flow")
    expect(geometry.label).toEqual({ x: 200, y: 62, align: "above" })
  })

  it("centres back labels on the middle of the path", () => {
    const geometry = pointsGeometry([{ x: 300, y: 90 }, { x: 300, y: 140 }, { x: 60, y: 140 }, { x: 60, y: 46 }], "back")
    expect(geometry.label).toEqual({ x: 180, y: 140, align: "center" })
  })
})

describe("labelTransform", () => {
  it("combines the canvas position with the alignment shift", () => {
    expect(labelTransform({ x: 10, y: 20, align: "center" })).toBe("translate(10px, 20px) translate(-50%, -50%)")
    expect(labelTransform({ x: 1, y: 2, align: "above" })).toBe("translate(1px, 2px) translate(0, -100%)")
  })
})
