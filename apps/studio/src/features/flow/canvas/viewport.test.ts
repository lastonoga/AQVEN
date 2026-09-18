import { describe, expect, it } from "vitest"
import { boxCentre, clamp, MAX_ZOOM, MIN_ZOOM, zoomedIn, zoomedOut } from "./viewport"

describe("boxCentre", () => {
  it("returns the middle of a node box", () => {
    expect(boxCentre({ x: 1878, y: 98, width: 1214, height: 810 })).toEqual({ x: 2485, y: 503 })
  })
})

describe("zoom steps", () => {
  it("multiplies and divides by 1.15 inside the canvas limits", () => {
    expect(zoomedIn(1)).toBeCloseTo(1.15)
    expect(zoomedOut(1.15)).toBeCloseTo(1)
    expect(zoomedIn(MAX_ZOOM)).toBe(MAX_ZOOM)
    expect(zoomedOut(MIN_ZOOM)).toBe(MIN_ZOOM)
  })

  it("clamps values", () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-5, 0, 1)).toBe(0)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
  })
})
