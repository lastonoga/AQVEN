import { Position } from "@xyflow/react"
import { describe, expect, it } from "vitest"
import { edgeGeometry, labelTransform, uPath, type EdgeEndpoints } from "./edge-paths"

const ends = (sourceX: number, sourceY: number, targetX: number, targetY: number): EdgeEndpoints => ({
  sourceX,
  sourceY,
  sourcePosition: Position.Right,
  targetX,
  targetY,
  targetPosition: Position.Left,
})

describe("uPath", () => {
  it("draws the critic loop back edge as a leftward U", () => {
    expect(uPath(2900, 506, 2068, 466, 880, 16)).toBe("M 2900 506 L 2900 864 A 16 16 0 0 1 2884 880 L 2084 880 A 16 16 0 0 1 2068 864 L 2068 466")
  })

  it("flips the arc sweep for a rightward U", () => {
    expect(uPath(100, 0, 300, 10, 200, 10)).toBe("M 100 0 L 100 190 A 10 10 0 0 0 110 200 L 290 200 A 10 10 0 0 0 300 190 L 300 10")
  })
})

describe("edgeGeometry", () => {
  it("places branch labels above the target line after the source", () => {
    const geometry = edgeGeometry(ends(3250, 460, 3490, 240), { variant: "flow", label: "approved" })
    expect(geometry.label).toEqual({ x: 3290, y: 229, align: "above" })
    expect(geometry.path).toBe("M3250 460L3270 460L 3356,460Q 3370,460 3370,446L 3370,254Q 3370,240 3384,240L3470 240L3490 240")
  })

  it("centres back edge labels on the detour line", () => {
    const geometry = edgeGeometry(ends(2900, 506, 2068, 460), { variant: "back", label: "back", detourY: 880 })
    expect(geometry.label).toEqual({ x: 2484, y: 880, align: "center" })
  })

  it("falls back to a detour below both endpoints", () => {
    const geometry = edgeGeometry(ends(0, 100, 50, 60), { variant: "back", label: null, detourY: null })
    expect(geometry.label.y).toBe(148)
  })
})

describe("labelTransform", () => {
  it("combines the canvas position with the alignment shift", () => {
    expect(labelTransform({ x: 10, y: 20, align: "center" })).toBe("translate(10px, 20px) translate(-50%, -50%)")
    expect(labelTransform({ x: 1, y: 2, align: "above" })).toBe("translate(1px, 2px) translate(0, -100%)")
  })
})
