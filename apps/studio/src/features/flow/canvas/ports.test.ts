import { describe, expect, it } from "vitest"
import type { Box, CanvasEdge, CanvasGraph, CanvasNode } from "../layout"
import { nodePorts, portsOf, sourceHandleOf, targetHandleOf } from "./ports"

const box = (y: number, height = 60): Box => ({ x: 0, y, width: 200, height })

const step = (id: string, y: number): CanvasNode => ({
  id,
  parent: null,
  box: box(y),
  size: "md",
  kind: "code",
  name: id,
  problems: 0,
  reversed: false,
  role: "step",
  meta: "",
  inputs: 0,
  outputs: 0,
})

const flow = (source: string, target: string): CanvasEdge => ({ id: `${source}→${target}`, source, target, variant: "flow" })
const back = (source: string, target: string): CanvasEdge => ({ id: `${source}⟲${target}`, source, target, variant: "back" })

const graphOf = (nodes: readonly CanvasNode[], edges: readonly CanvasEdge[]): CanvasGraph => ({
  nodes,
  edges,
  extent: { x: 0, y: 0, width: 0, height: 0 },
})

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

describe("nodePorts", () => {
  it("gives a node with a single edge on a side one centred port", () => {
    const graph = graphOf([step("a", 0), step("b", 0)], [flow("a", "b")])
    const ports = nodePorts(graph)
    expect(portsOf(ports, "a").out).toEqual([{ id: `out-${flow("a", "b").id}`, offset: 0.5 }])
    expect(portsOf(ports, "b").in).toEqual([{ id: `in-${flow("a", "b").id}`, offset: 0.5 }])
  })

  it("orders a node's out ports by the y of whatever each edge targets", () => {
    const graph = graphOf(
      [step("source", 0), step("low", 200), step("high", 0), step("mid", 100)],
      [flow("source", "low"), flow("source", "high"), flow("source", "mid")],
    )
    const out = portsOf(nodePorts(graph), "source").out
    expect(out.map((port) => port.id)).toEqual([
      `out-${flow("source", "high").id}`,
      `out-${flow("source", "mid").id}`,
      `out-${flow("source", "low").id}`,
    ])
    expect(out.map((port) => port.offset)).toEqual([0.2, 0.5, 0.8])
  })

  it("orders a node's in ports by the y of whatever each edge comes from", () => {
    const graph = graphOf(
      [step("target", 0), step("low", 200), step("high", 0)],
      [flow("low", "target"), flow("high", "target")],
    )
    const inPorts = portsOf(nodePorts(graph), "target").in
    expect(inPorts.map((port) => port.id)).toEqual([`in-${flow("high", "target").id}`, `in-${flow("low", "target").id}`])
  })

  it("folds a back edge's target into the same in-port spread as ordinary flow edges", () => {
    const graph = graphOf(
      [step("entry", 0), step("outside", 0), step("last", 200)],
      [flow("outside", "entry"), back("last", "entry")],
    )
    const inPorts = portsOf(nodePorts(graph), "entry").in
    expect(inPorts).toHaveLength(2)
    expect(inPorts.map((port) => port.id)).toContain(`in-${back("last", "entry").id}`)
  })

  it("gives a node with no edges on a side an empty port list", () => {
    const graph = graphOf([step("lonely", 0)], [])
    const ports = portsOf(nodePorts(graph), "lonely")
    expect(ports).toEqual({ in: [], out: [] })
  })

  it("falls back to empty ports for a node id absent from the graph", () => {
    expect(portsOf(nodePorts(graphOf([], [])), "missing")).toEqual({ in: [], out: [] })
  })
})
