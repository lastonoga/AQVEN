import { describe, expect, test } from "vitest"
import { anchorOf, chainLength, orthoRoute, routeChain, roundedPath, stubPoint } from "./edge-route.js"
import type { Point, RouteGeometry } from "./edge-route.js"

const geometry: RouteGeometry = {
  source: { x: 0, y: 0 },
  target: { x: 400, y: 120 },
  sourceSide: "right",
  targetSide: "left",
}

const orthogonal = (points: readonly Point[]): boolean =>
  points.slice(1).every((point, index) => {
    const previous = points[index]
    if (previous === undefined) return false
    return previous.x === point.x || previous.y === point.y
  })

const onChain = (points: readonly Point[], probe: Point): boolean =>
  points.slice(1).some((point, index) => {
    const previous = points[index]
    if (previous === undefined) return false
    const within = (from: number, to: number, value: number): boolean =>
      value >= Math.min(from, to) - 0.01 && value <= Math.max(from, to) + 0.01
    if (previous.x === point.x) return Math.abs(probe.x - point.x) < 0.01 && within(previous.y, point.y, probe.y)
    return Math.abs(probe.y - point.y) < 0.01 && within(previous.x, point.x, probe.x)
  })

describe("edge-route", () => {
  test("stub leaves the handle along its side", () => {
    expect(stubPoint({ x: 10, y: 10 }, "right", 24)).toEqual({ x: 34, y: 10 })
    expect(stubPoint({ x: 10, y: 10 }, "left", 24)).toEqual({ x: -14, y: 10 })
    expect(stubPoint({ x: 10, y: 10 }, "top", 24)).toEqual({ x: 10, y: -14 })
    expect(stubPoint({ x: 10, y: 10 }, "bottom", 24)).toEqual({ x: 10, y: 34 })
  })

  test("chain keeps endpoints and stays orthogonal", () => {
    const chain = routeChain(geometry, [
      { x: 0, y: 0 },
      { x: 200, y: 40 },
      { x: 240, y: 120 },
      { x: 400, y: 120 },
    ])
    expect(chain[0]).toEqual(geometry.source)
    expect(chain[chain.length - 1]).toEqual(geometry.target)
    expect(orthogonal(chain)).toBe(true)
  })

  test("chain keeps the dagre corridor", () => {
    const chain = routeChain(geometry, [{ x: 200, y: 40 }])
    expect(chain.some((point) => point.x === 200)).toBe(true)
  })

  test("no usable points means no ortho route", () => {
    expect(orthoRoute(geometry, [], "center")).toBeNull()
    expect(orthoRoute(geometry, [{ x: 2, y: 2 }], "center")).toBeNull()
  })

  test("path starts at the source and rounds its turns", () => {
    const route = orthoRoute(geometry, [{ x: 200, y: 40 }], "center")
    expect(route).not.toBeNull()
    expect(route?.path.startsWith("M 0,0")).toBe(true)
    expect(route?.path.includes("Q")).toBe(true)
  })

  test("anchors sit on the routed chain", () => {
    const points = [{ x: 200, y: 40 }]
    const chain = routeChain(geometry, points)
    expect(onChain(chain, anchorOf(chain, "center"))).toBe(true)
    expect(onChain(chain, anchorOf(chain, "source"))).toBe(true)
  })

  test("source anchor stays ahead of the centre on long edges", () => {
    const chain = routeChain(geometry, [{ x: 200, y: 40 }])
    const lead = chainLength(chain.slice(0, 2))
    expect(lead).toBeGreaterThan(0)
    expect(anchorOf(chain, "source").x).toBeLessThan(anchorOf(chain, "center").x + 1)
  })

  test("degenerate chain yields an empty path", () => {
    expect(roundedPath([])).toBe("")
  })
})
