import { execFileSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { describe, expect, test } from "vitest"
import { expandIr } from "./expand.js"
import { groupIdsOf, placeGraph } from "./frame-layout.js"
import { contains, overlaps } from "./layout.js"
import type { Ir } from "../api/types.js"
import type { ExpandedNode } from "./expand.js"
import type { Rect } from "./layout.js"

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, "../../../..")
const scanner = pathToFileURL(resolve(repo, "packages/cli/dist/scan.js")).href

type SynthesizedFlow = { id: string; ir: Ir }

const flowsOf = (dir: string): SynthesizedFlow[] => {
  const script = [
    `import { scan } from ${JSON.stringify(scanner)}`,
    `const report = await scan(${JSON.stringify(resolve(repo, dir))})`,
    `const kept = report.flows.filter((flow) => flow.ir !== undefined)`,
    `process.stdout.write(JSON.stringify(kept.map((flow) => ({ id: flow.id, ir: flow.ir }))))`,
  ].join("\n")
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
  return JSON.parse(out) as SynthesizedFlow[]
}

const patterns = flowsOf("examples/patterns")
const hotel = flowsOf("examples/hotel-pitch")
const every = [...hotel, ...patterns]

const ancestorPairs = (nodes: readonly ExpandedNode[]): Set<string> => {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const pairs = new Set<string>()
  for (const node of nodes) {
    let cursor = node.parentId
    while (cursor !== null) {
      pairs.add(`${cursor}|${node.id}`)
      pairs.add(`${node.id}|${cursor}`)
      cursor = byId.get(cursor)?.parentId ?? null
    }
  }
  return pairs
}

type Collision = { left: string; right: string }

const collisionsIn = (nodes: readonly ExpandedNode[], rects: ReadonlyMap<string, Rect>): Collision[] => {
  const related = ancestorPairs(nodes)
  const placed = nodes.flatMap((node) => {
    const rect = rects.get(node.id)
    return rect === undefined ? [] : [{ id: node.id, rect }]
  })
  const found: Collision[] = []
  for (let left = 0; left < placed.length; left += 1) {
    for (let right = left + 1; right < placed.length; right += 1) {
      const a = placed[left]
      const b = placed[right]
      if (a === undefined || b === undefined) continue
      if (related.has(`${a.id}|${b.id}`)) continue
      if (!overlaps(a.rect, b.rect)) continue
      found.push({ left: a.id, right: b.id })
    }
  }
  return found
}

const escapees = (nodes: readonly ExpandedNode[], rects: ReadonlyMap<string, Rect>): string[] =>
  nodes.flatMap((node) => {
    if (node.parentId === null) return []
    const inner = rects.get(node.id)
    const outer = rects.get(node.parentId)
    if (inner === undefined || outer === undefined) return []
    return contains(outer, inner) ? [] : [node.id]
  })

const missing = (nodes: readonly ExpandedNode[], rects: ReadonlyMap<string, Rect>): string[] =>
  nodes.filter((node) => rects.get(node.id) === undefined).map((node) => node.id)

describe("expandIr раскрывает компоненты и параллелизм", () => {
  test("примеры синтезируются", () => {
    expect(patterns.length).toBe(15)
    expect(hotel.length).toBe(1)
  })

  const graphOf = (flows: readonly SynthesizedFlow[], id: string) => {
    const flow = flows.find((item) => item.id === id)
    expect(flow).toBeDefined()
    return expandIr(flow?.ir ?? ({ nodes: {}, components: {} } as unknown as Ir))
  }

  const under = (graph: ReturnType<typeof expandIr>, root: string): ExpandedNode[] => {
    const byId = new Map(graph.nodes.map((node) => [node.id, node]))
    const inside = (node: ExpandedNode): boolean => {
      let cursor = node.parentId
      while (cursor !== null) {
        if (cursor === root) return true
        cursor = byId.get(cursor)?.parentId ?? null
      }
      return false
    }
    return graph.nodes.filter(inside)
  }

  test("diverge_merge: у drafts видно разветвление, ветки и сведение", () => {
    const graph = graphOf(patterns, "diverge_merge")
    const drafts = graph.nodes.find((node) => node.id === "drafts")
    expect(drafts?.group).not.toBeNull()
    expect(drafts?.group?.parallel).toBe(true)
    expect(drafts?.group?.branches).toBe(4)

    const inside = under(graph, "drafts")
    expect(inside.filter((node) => node.kind === "fanout").length).toBeGreaterThan(0)
    expect(inside.filter((node) => node.kind === "fanin").length).toBeGreaterThan(0)
    expect(inside.some((node) => node.group?.component === "idea_set")).toBe(true)
    expect(inside.some((node) => node.kind === "llm")).toBe(true)

    const ids = new Set(inside.map((node) => node.id))
    const fanout = graph.edges.filter((edge) => edge.kind === "fanout" && ids.has(edge.target))
    const fanin = graph.edges.filter((edge) => edge.kind === "fanin" && ids.has(edge.source))
    expect(fanout.length).toBeGreaterThan(0)
    expect(fanin.length).toBeGreaterThan(0)
  })

  test("hotel_pitch: pitches разворачивается в три ветки по температуре", () => {
    const graph = graphOf(hotel, "hotel_pitch")
    const pitches = graph.nodes.find((node) => node.id === "pitches")
    expect(pitches?.group?.parallel).toBe(true)
    expect(pitches?.group?.branches).toBe(3)
    expect(pitches?.group?.note).toContain("temperature")
    const inside = under(graph, "pitches")
    expect(inside.filter((node) => node.group?.component === "pitch_gen")).toHaveLength(3)
    expect(inside.filter((node) => node.kind === "llm")).toHaveLength(3)
  })

  test("judge_panel: три судьи идут параллельно и сводятся в один", () => {
    const graph = graphOf(patterns, "judge_panel")
    const panel = graph.nodes.find((node) => node.id === "panel")
    expect(panel?.group?.parallel).toBe(true)
    const inside = under(graph, "panel")
    const judges = inside.filter((node) => node.group?.component.startsWith("judge_") === true)
    expect(judges).toHaveLength(3)
    const joins = inside.filter((node) => node.kind === "fanin")
    expect(joins).toHaveLength(1)
    const joinId = joins[0]?.id ?? ""
    expect(graph.edges.filter((edge) => edge.target === joinId)).toHaveLength(3)
  })

  test("cascade раскрывает map до примитивов компонента", () => {
    const graph = graphOf(patterns, "cascade")
    const ids = new Set(graph.nodes.map((node) => node.id))
    expect(ids.has("triage/split")).toBe(true)
    expect(ids.has("triage/item/cheap")).toBe(true)
    expect(ids.has("triage/item/chosen")).toBe(true)
    expect(graph.edges.some((edge) => edge.kind === "branch")).toBe(true)
  })

  test("каждый воркфлоу раскрывается не меньше, чем его плоский IR", () => {
    for (const flow of every) {
      const graph = expandIr(flow.ir)
      expect(graph.nodes.length).toBeGreaterThanOrEqual(Object.keys(flow.ir.nodes).length)
    }
  })
})

describe("раскладка не даёт наслоений", () => {
  test.each(every.map((flow) => [flow.id, flow] as const))(
    "%s: развёрнутые группы",
    (_id, flow) => {
      const graph = expandIr(flow.ir)
      const placement = placeGraph(graph, new Set(), new Map())
      expect(missing(placement.visible, placement.layout.rects)).toEqual([])
      expect(collisionsIn(placement.visible, placement.layout.rects)).toEqual([])
      expect(escapees(placement.visible, placement.layout.rects)).toEqual([])
    },
  )

  test.each(every.map((flow) => [flow.id, flow] as const))(
    "%s: свёрнутые группы",
    (_id, flow) => {
      const graph = expandIr(flow.ir)
      const placement = placeGraph(graph, new Set(groupIdsOf(graph)), new Map())
      expect(collisionsIn(placement.visible, placement.layout.rects)).toEqual([])
      expect(escapees(placement.visible, placement.layout.rects)).toEqual([])
    },
  )

  test.each(every.map((flow) => [flow.id, flow] as const))(
    "%s: измеренные размеры карточек",
    (_id, flow) => {
      const graph = expandIr(flow.ir)
      const dry = placeGraph(graph, new Set(), new Map())
      const measured = new Map(
        [...dry.sized].map((id, index) => [id, { width: 224, height: 96 + (index % 7) * 13 }]),
      )
      const placement = placeGraph(graph, new Set(), measured)
      expect(collisionsIn(placement.visible, placement.layout.rects)).toEqual([])
      expect(escapees(placement.visible, placement.layout.rects)).toEqual([])
    },
  )
})
