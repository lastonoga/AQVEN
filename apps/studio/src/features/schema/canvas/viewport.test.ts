import { describe, expect, it } from "vitest"
import { MAX_ZOOM, MIN_ZOOM, clamp, stageFocus, zoomedIn, zoomedOut } from "./viewport"

describe("stageFocus", () => {
  it("centres the critic loop at the fitted zoom", () => {
    const focus = stageFocus({ x: 1878, y: 98, width: 1214, height: 810 }, { width: 1211, height: 762 })
    expect(focus.x).toBe(2485)
    expect(focus.y).toBe(503)
    expect(focus.zoom).toBeCloseTo(0.706, 3)
  })

  it("clamps the focus zoom between 0.30 and 1.05", () => {
    expect(stageFocus({ x: 0, y: 0, width: 100, height: 100 }, { width: 1600, height: 1000 }).zoom).toBe(1.05)
    expect(stageFocus({ x: 0, y: 0, width: 9000, height: 9000 }, { width: 1600, height: 1000 }).zoom).toBe(0.3)
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
