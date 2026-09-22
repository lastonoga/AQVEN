import { describe, expect, it } from "vitest"
import type { CanvasEdge } from "../layout"
import { colorOf, colorsBySource, FLOW_PALETTE } from "./edge-colors"

const flow = (source: string, target: string): CanvasEdge => ({ id: `${source}→${target}`, source, target, variant: "flow" })
const back = (source: string, target: string): CanvasEdge => ({ id: `${source}⟲${target}`, source, target, variant: "back" })

describe("colorsBySource", () => {
  it("gives every source its own color in first-appearance order", () => {
    const edges = [flow("a", "x"), flow("b", "y"), flow("a", "z")]
    const colors = colorsBySource(edges)
    expect(colors.get("a")).toBe(FLOW_PALETTE[0])
    expect(colors.get("b")).toBe(FLOW_PALETTE[1])
  })

  it("keeps every edge from the same source on the same color", () => {
    const edges = [flow("a", "x"), flow("a", "y"), flow("a", "z")]
    const colors = colorsBySource(edges)
    expect(colors.get("a")).toBe(FLOW_PALETTE[0])
    expect(colors.size).toBe(1)
  })

  it("cycles back through the palette once sources outnumber it", () => {
    const edges = FLOW_PALETTE.map((_, index) => flow(`source-${index}`, "sink"))
    edges.push(flow("source-wraps", "sink"))
    const colors = colorsBySource(edges)
    expect(colors.get("source-wraps")).toBe(FLOW_PALETTE[0])
  })

  it("never assigns a source color from a back edge", () => {
    const colors = colorsBySource([back("last", "first")])
    expect(colors.has("last")).toBe(false)
  })
})

describe("colorOf", () => {
  it("always renders a back edge in the loop color, regardless of source", () => {
    const colors = colorsBySource([flow("last", "elsewhere")])
    expect(colorOf(colors, back("last", "first"))).toBe("var(--loop)")
  })

  it("looks up a flow edge's source color", () => {
    const edges = [flow("a", "x"), flow("b", "y")]
    const colors = colorsBySource(edges)
    expect(colorOf(colors, edges[1] ?? flow("b", "y"))).toBe(FLOW_PALETTE[1])
  })

  it("falls back to the first palette color for a source missing from the map", () => {
    expect(colorOf(new Map(), flow("unknown", "sink"))).toBe(FLOW_PALETTE[0])
  })
})
