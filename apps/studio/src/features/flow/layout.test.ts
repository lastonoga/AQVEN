import { beforeAll, describe, expect, it } from "vitest"
import type { ApiNode } from "@/domain"
import { liveNodes } from "@/mocks/data/nodes"
import { liveFlowDetails } from "@/mocks/data/project"
import { absoluteBox, buildGraph, type Box, type CanvasGraph } from "./layout"

const nodesOf = (flowId: string): readonly ApiNode[] => liveNodes[flowId] ?? []
const orderOf = (flowId: string): readonly string[] => liveFlowDetails[flowId]?.order ?? []

const graphOf = (flowId: string): Promise<CanvasGraph> => buildGraph(nodesOf(flowId), orderOf(flowId))

const step = (id: string, downstream: readonly string[]): ApiNode => ({
  node_id: id,
  local_id: id,
  parent: null,
  kind: "code",
  path: "",
  file_hash: "",
  agent: null,
  inference: null,
  prompt_level: null,
  code_ref: null,
  problems_count: 0,
  upstream: [],
  downstream: [...downstream],
})

const ZERO_BOX: Box = { x: 0, y: 0, width: 0, height: 0 }

const boxOf = (graph: CanvasGraph, id: string): Box => absoluteBox(graph.nodes, id) ?? ZERO_BOX

const inside = (child: Box, parent: Box): boolean =>
  child.x >= 0 && child.y >= 0 && child.x + child.width <= parent.width && child.y + child.height <= parent.height

describe("buildGraph", () => {
  let graph: CanvasGraph
  beforeAll(async () => {
    graph = await graphOf("support_case")
  })

  it("places every top level node once", () => {
    expect(graph.nodes.filter((node) => node.parent === null)).toHaveLength(18)
  })

  it("runs every dependency strictly left to right, never backwards", () => {
    const backwards = graph.edges
      .filter((edge) => edge.variant === "flow")
      .filter((edge) => boxOf(graph, edge.source).x + boxOf(graph, edge.source).width > boxOf(graph, edge.target).x + 1)
    expect(backwards).toEqual([])
  })

  it("reads from the flow entry at the far left to its exit at the far right", () => {
    const roots = graph.nodes.filter((node) => node.parent === null)
    const leftmost = Math.min(...roots.map((node) => boxOf(graph, node.id).x))
    const rightmost = Math.max(...roots.map((node) => boxOf(graph, node.id).x))
    expect(boxOf(graph, "prepare").x).toBe(leftmost)
    expect(boxOf(graph, "finalize").x).toBe(rightmost)
  })

  it("pulls a node with many late consumers well past its producer's next column", () => {
    const triage = boxOf(graph, "triage")
    const searchKb = boxOf(graph, "search_kb")
    expect(searchKb.x).toBeGreaterThan(triage.x + 2 * triage.width)
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
    expect(containers.map((node) => node.id).sort()).toEqual(["approvals", "drafts", "intent", "polish", "record", "route", "vote"])
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
    expect(back.map((edge) => `${edge.source}→${edge.target}`).sort()).toEqual(["polish__critique→polish__revise", "record__validate→record__extract"])
  })

  it("leaves a wide channel between a loop's back edge and its first child", () => {
    const back = graph.edges.find((edge) => edge.id === "record__validate⟲record__extract")
    const first = graph.nodes.find((node) => node.id === "record__extract")
    if (back === undefined || first === undefined) throw new Error("record loop not laid out")
    const channelX = back.points[2]?.x ?? 0
    expect(channelX).toBeLessThanOrEqual(boxOf(graph, first.id).x - 15)
  })

  it("never draws an edge onto itself and never repeats one", () => {
    expect(graph.edges.filter((edge) => edge.source === edge.target)).toEqual([])
    expect(new Set(graph.edges.map((edge) => edge.id)).size).toBe(graph.edges.length)
  })

  it("is deterministic", async () => {
    expect(await graphOf("support_case")).toEqual(graph)
  })

  it("reports the absolute position of a nested node", () => {
    const drafts = graph.nodes.find((node) => node.id === "drafts")?.box
    const child = graph.nodes.find((node) => node.id === "drafts__gpt")?.box
    const absolute = absoluteBox(graph.nodes, "drafts__gpt")
    expect(absolute?.x).toBe((drafts?.x ?? 0) + (child?.x ?? 0))
    expect(absolute?.y).toBe((drafts?.y ?? 0) + (child?.y ?? 0))
  })

  it("routes every edge along at least two laid out points that end on the endpoints' borders", () => {
    graph.edges.forEach((edge) => {
      const source = boxOf(graph, edge.source)
      const target = boxOf(graph, edge.target)
      const first = edge.points.at(0)
      const last = edge.points.at(-1)
      expect(first === undefined || last === undefined ? null : { first, last }).not.toBeNull()
      if (first === undefined || last === undefined) return
      const onBorder = (point: { x: number; y: number }, box: Box): boolean =>
        point.x >= box.x - 1 && point.x <= box.x + box.width + 1 && point.y >= box.y - 1 && point.y <= box.y + box.height + 1
      expect(onBorder(first, source)).toBe(true)
      expect(onBorder(last, target)).toBe(true)
    })
  })

  it("never crosses the body of a node that is not an endpoint of the edge", () => {
    const ancestorsOf = (id: string): ReadonlySet<string> => {
      const seen = new Set<string>()
      let current = graph.nodes.find((node) => node.id === id)?.parent ?? null
      while (current !== null) {
        seen.add(current)
        current = graph.nodes.find((node) => node.id === current)?.parent ?? null
      }
      return seen
    }
    const EPS = 1
    const crosses = (a: { x: number; y: number }, b: { x: number; y: number }, box: Box): boolean => {
      const left = box.x + EPS
      const right = box.x + box.width - EPS
      const top = box.y + EPS
      const bottom = box.y + box.height - EPS
      if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01) return false
      if (Math.abs(a.x - b.x) < 0.01) {
        if (a.x <= left || a.x >= right) return false
        return Math.max(Math.min(a.y, b.y), top) < Math.min(Math.max(a.y, b.y), bottom)
      }
      if (Math.abs(a.y - b.y) < 0.01) {
        if (a.y <= top || a.y >= bottom) return false
        return Math.max(Math.min(a.x, b.x), left) < Math.min(Math.max(a.x, b.x), right)
      }
      return true
    }
    graph.edges.forEach((edge) => {
      const excluded = new Set([edge.source, edge.target, ...ancestorsOf(edge.source), ...ancestorsOf(edge.target)])
      graph.nodes
        .filter((node) => !excluded.has(node.id))
        .forEach((node) => {
          const box = boxOf(graph, node.id)
          edge.points.slice(0, -1).forEach((point, index) => {
            const next = edge.points[index + 1]
            if (next !== undefined && crosses(point, next, box)) {
              throw new Error(`${edge.id} crosses ${node.id} between ${JSON.stringify(point)} and ${JSON.stringify(next)}`)
            }
          })
        })
    })
  })
})

describe("buildGraph pulls a late consumer's source next to it", () => {
  const nodes: readonly ApiNode[] = [
    step("a", ["b"]),
    step("b", ["c"]),
    step("c", ["d"]),
    step("d", []),
    step("src", ["d"]),
  ]

  it("does not strand a source at the far left when its only consumer is deep in the flow", async () => {
    const graph = await buildGraph(nodes, ["a", "b", "c", "src", "d"])
    expect(boxOf(graph, "src").x).toBeGreaterThan(boxOf(graph, "a").x)
    expect(boxOf(graph, "src").x + boxOf(graph, "src").width).toBeLessThanOrEqual(boxOf(graph, "d").x + 1)
  })
})

describe("buildGraph reorders a rank to reduce edge crossings", () => {
  it("swaps a crossed pair to match their predecessors' order", async () => {
    const nodes: readonly ApiNode[] = [step("a1", ["b2"]), step("a2", ["b1"]), step("b1", []), step("b2", [])]
    const graph = await buildGraph(nodes, ["a1", "a2", "b1", "b2"])
    expect(boxOf(graph, "b2").y).toBeLessThan(boxOf(graph, "b1").y)
  })

  it("leaves an untied rank in its declared order", async () => {
    const nodes: readonly ApiNode[] = [step("a1", ["b1", "b2"]), step("b1", []), step("b2", [])]
    const graph = await buildGraph(nodes, ["a1", "b1", "b2"])
    expect(boxOf(graph, "b1").y).toBeLessThan(boxOf(graph, "b2").y)
  })
})

describe("buildGraph on judge_panel", () => {
  let graph: CanvasGraph
  beforeAll(async () => {
    graph = await graphOf("judge_panel")
  })

  it("lays out a flow whose container children have no dependencies at all", () => {
    expect(boxOf(graph, "judges").x).toBeLessThan(boxOf(graph, "aggregate").x)
    expect(boxOf(graph, "aggregate").x).toBeLessThan(boxOf(graph, "decide").x)
    expect(boxOf(graph, "decide").x).toBeLessThan(boxOf(graph, "pick").x)
    expect(graph.nodes.filter((node) => node.parent === "judges")).toHaveLength(3)
  })

  it("lifts a dependency that crosses into a sibling container and keeps only the spine", () => {
    const tieBreak = nodesOf("judge_panel").find((node) => node.node_id === "decide__tie_break")
    expect(tieBreak?.upstream).toContain("judges")
    expect(graph.edges.map((edge) => edge.id)).toEqual(["judges→aggregate", "aggregate→decide", "decide→pick"])
  })
})
