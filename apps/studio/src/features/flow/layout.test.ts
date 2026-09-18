import { describe, expect, it } from "vitest"
import type { ApiNode } from "@/domain"
import { liveNodes } from "@/mocks/data/nodes"
import { liveFlowDetails } from "@/mocks/data/project"
import { absoluteBox, buildGraph, type Box, type CanvasNode } from "./layout"

const nodesOf = (flowId: string): readonly ApiNode[] => liveNodes[flowId] ?? []
const orderOf = (flowId: string): readonly string[] => liveFlowDetails[flowId]?.order ?? []

const graphOf = (flowId: string) => buildGraph(nodesOf(flowId), orderOf(flowId))

const rowsOf = (nodes: readonly CanvasNode[]): readonly (readonly CanvasNode[])[] => {
  const top = [...nodes].filter((node) => node.parent === null).sort((left, right) => left.box.y - right.box.y)
  const rows: CanvasNode[][] = []
  let bottom = -1
  top.forEach((node) => {
    const current = rows.at(-1)
    if (current === undefined || node.box.y >= bottom) {
      rows.push([node])
      bottom = node.box.y + node.box.height
      return
    }
    current.push(node)
    bottom = Math.max(bottom, node.box.y + node.box.height)
  })
  return rows.map((row) => [...row].sort((left, right) => left.box.x - right.box.x))
}

const readingOrder = (nodes: readonly CanvasNode[]): readonly string[] => rowsOf(nodes).flatMap((row) => row.map((node) => node.id))

const positionOf = (nodes: readonly CanvasNode[], id: string): number => readingOrder(nodes).indexOf(id)

const inside = (child: Box, parent: Box): boolean =>
  child.x >= 0 && child.y >= 0 && child.x + child.width <= parent.width && child.y + child.height <= parent.height

describe("buildGraph", () => {
  const graph = graphOf("support_case")

  it("places every top level node once and reads from the flow entry to its exit", () => {
    const reading = readingOrder(graph.nodes)
    expect(graph.nodes.filter((node) => node.parent === null)).toHaveLength(18)
    expect(reading).toHaveLength(18)
    expect(reading.at(0)).toBe("prepare")
    expect(reading.at(-1)).toBe("finalize")
  })

  it("orders every dependency forwards", () => {
    const backwards = graph.edges
      .filter((edge) => edge.variant === "flow")
      .filter((edge) => positionOf(graph.nodes, edge.source) >= positionOf(graph.nodes, edge.target))
      .filter((edge) => positionOf(graph.nodes, edge.source) >= 0)
    expect(backwards).toEqual([])
  })

  it("breaks a tie between two independent nodes with the declared flow order", () => {
    const vote = graph.nodes.find((node) => node.id === "vote")?.box
    const searchKb = graph.nodes.find((node) => node.id === "search_kb")?.box
    expect(vote?.x).toBeLessThan((searchKb?.x ?? 0) + 8)
    expect(vote?.y).toBeLessThan(searchKb?.y ?? 0)
  })

  it("nests every child inside its container", () => {
    const boxes = new Map(graph.nodes.map((node) => [node.id, node.box]))
    const nested = graph.nodes.filter((node) => node.parent !== null)
    expect(nested).toHaveLength(12)
    nested.forEach((node) => {
      const parent = boxes.get(node.parent ?? "")
      expect(parent === undefined ? null : inside(node.box, parent)).toBe(true)
    })
  })

  it("renders a node with children as a container and the rest as steps", () => {
    const containers = graph.nodes.filter((node) => node.role === "container")
    expect(containers.map((node) => node.id)).toEqual(["vote", "intent", "record", "route", "drafts", "polish", "approvals"])
    expect(containers.find((node) => node.id === "drafts")?.members).toBe(3)
    expect(graph.nodes.filter((node) => node.role === "step")).toHaveLength(23)
  })

  it("drops the aggregation edges that point from a child to its own container", () => {
    const parents = new Map(nodesOf("support_case").map((node) => [node.node_id, node.parent]))
    expect(graph.edges.filter((edge) => parents.get(edge.source) === edge.target)).toEqual([])
  })

  it("keeps only the spine of the dependency graph", () => {
    const ids = graph.edges.map((edge) => edge.id)
    expect(ids).toContain("prepare→triage")
    expect(ids).toContain("triage→vote")
    expect(ids).toContain("approvals→finalize")
    expect(ids).not.toContain("prepare→polish")
    expect(ids).not.toContain("triage→drafts")
  })

  it("synthesises the loop back edges that the dependency graph never reports", () => {
    const back = graph.edges.filter((edge) => edge.variant === "back")
    expect(back.map((edge) => `${edge.source}→${edge.target}`)).toEqual(["record__validate→record__extract", "polish__critique→polish__revise"])
    const critique = nodesOf("support_case").find((node) => node.node_id === "polish__critique")
    expect(critique?.downstream).not.toContain("polish__revise")
  })

  it("never draws an edge onto itself and never repeats one", () => {
    expect(graph.edges.filter((edge) => edge.source === edge.target)).toEqual([])
    expect(new Set(graph.edges.map((edge) => edge.id)).size).toBe(graph.edges.length)
  })

  it("wraps the long pipeline into a readable extent instead of one endless row", () => {
    expect(graph.extent.width).toBeLessThan(1600)
    expect(graph.extent.height).toBeGreaterThan(graph.extent.width / 3)
  })

  it("is deterministic", () => {
    expect(graphOf("support_case")).toEqual(graph)
  })

  it("reports the absolute position of a nested node", () => {
    const drafts = graph.nodes.find((node) => node.id === "drafts")?.box
    const child = graph.nodes.find((node) => node.id === "drafts__gpt")?.box
    const absolute = absoluteBox(graph.nodes, "drafts__gpt")
    expect(absolute?.x).toBe((drafts?.x ?? 0) + (child?.x ?? 0))
    expect(absolute?.y).toBe((drafts?.y ?? 0) + (child?.y ?? 0))
  })
})

describe("buildGraph on judge_panel", () => {
  const graph = graphOf("judge_panel")

  it("lays out a flow whose container children have no dependencies at all", () => {
    expect(readingOrder(graph.nodes)).toEqual(["judges", "aggregate", "decide", "pick"])
    expect(graph.extent.height).toBe(334)
    expect(graph.nodes.filter((node) => node.parent === "judges")).toHaveLength(3)
  })

  it("lifts a dependency that crosses into a sibling container and keeps only the spine", () => {
    const tieBreak = nodesOf("judge_panel").find((node) => node.node_id === "decide__tie_break")
    expect(tieBreak?.upstream).toContain("judges")
    expect(graph.edges.map((edge) => edge.id)).toEqual(["judges→aggregate", "aggregate→decide", "decide→pick"])
  })
})
