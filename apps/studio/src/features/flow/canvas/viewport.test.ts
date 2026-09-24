import { describe, expect, it } from "vitest"
import { boxCentre, clamp, insetCentre, MAX_ZOOM, MIN_ZOOM, zoomedIn, zoomedOut } from "./viewport"

describe("boxCentre", () => {
  it("returns the middle of a node box", () => {
    expect(boxCentre({ x: 1878, y: 98, width: 1214, height: 810 })).toEqual({ x: 2485, y: 503 })
  })
})

describe("insetCentre", () => {
  it("moves the centre right by half the covered width in flow units, so the node lands in the visible part", () => {
    expect(insetCentre({ x: 100, y: 40 }, 520, 0.5)).toEqual({ x: 620, y: 40 })
    expect(insetCentre({ x: 100, y: 40 }, 520, 1)).toEqual({ x: 360, y: 40 })
  })

  it("keeps the centre when nothing covers the canvas", () => {
    expect(insetCentre({ x: 100, y: 40 }, 0, 1)).toEqual({ x: 100, y: 40 })
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
