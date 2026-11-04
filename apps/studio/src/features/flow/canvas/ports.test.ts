import { describe, expect, it } from "vitest"
import type { CanvasEdge, NodePorts } from "../layout"
import { portsOf, sourceHandleOf, targetHandleOf } from "./ports"

const flow = (source: string, target: string): CanvasEdge => ({ id: `${source}→${target}`, source, target, variant: "flow", points: [] })
const back = (source: string, target: string): CanvasEdge => ({ id: `${source}⟲${target}`, source, target, variant: "back", points: [] })

describe("sourceHandleOf and targetHandleOf", () => {
  it("routes a back edge out of the fixed bottom handle, never a spread port", () => {
    const edge = back("last", "first")
    expect(sourceHandleOf(edge)).toBe("bottom")
    expect(targetHandleOf(edge)).toBe(`in-${edge.id}`)
  })

  it("gives a flow edge its own out and in handle, keyed by the edge id", () => {
    const edge = flow("a", "b")
    expect(sourceHandleOf(edge)).toBe(`out-${edge.id}`)
    expect(targetHandleOf(edge)).toBe(`in-${edge.id}`)
  })
})

describe("portsOf", () => {
  it("returns the ports the layout stored for the node", () => {
    const ports: NodePorts = { in: [{ id: "in-a→b", offset: 0.4, edgeId: "a→b" }], out: [], bottom: [] }
    expect(portsOf(new Map([["b", ports]]), "b")).toEqual(ports)
  })

  it("falls back to empty ports for a node id absent from the map", () => {
    expect(portsOf(new Map(), "missing")).toEqual({ in: [], out: [], bottom: [] })
  })
})
