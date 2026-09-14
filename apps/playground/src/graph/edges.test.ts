import { execFileSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { describe, expect, test } from "vitest"
import { buildFrame, buildScene } from "./scene.js"
import { placeGraph } from "./frame-layout.js"
import { ROUTE_OFFSET, routeChain } from "./edge-route.js"
import type { Ir } from "../api/types.js"
import type { Point } from "./edge-route.js"
import type { ExpandedNode } from "./expand.js"
import type { Rect } from "./layout.js"

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, "../../../..")
const scanner = pathToFileURL(resolve(repo, "packages/cli/dist/scan.js")).href

const TOUCH = 0.5

const OPEN: ReadonlySet<string> = new Set()

const NO_MEASURES: ReadonlyMap<string, { width: number; height: number }> = new Map()

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

const flows = [...flowsOf("examples/hotel-pitch"), ...flowsOf("examples/patterns")]

const exitPoint = (rect: Rect): Point => ({ x: rect.x + rect.width, y: rect.y + rect.height / 2 })

const entryPoint = (rect: Rect): Point => ({ x: rect.x, y: rect.y + rect.height / 2 })

const smoothStepPoints = (source: Point, target: Point): Point[] => {
  const left = { x: source.x + ROUTE_OFFSET, y: source.y }
  const right = { x: target.x - ROUTE_OFFSET, y: target.y }
  if (left.x < right.x) {
    const middle = (left.x + right.x) / 2
    return [source, left, { x: middle, y: left.y }, { x: middle, y: right.y }, right, target]
  }
  const middle = (left.y + right.y) / 2
  return [source, left, { x: left.x, y: middle }, { x: right.x, y: middle }, right, target]
}

type Segment = { from: Point; to: Point }

const segmentsOf = (points: readonly Point[]): Segment[] =>
  points.flatMap((from, index) => {
    const to = points[index + 1]
    return to === undefined ? [] : [{ from, to }]
  })

const shrink = (rect: Rect): Rect => ({
  x: rect.x + TOUCH,
  y: rect.y + TOUCH,
  width: rect.width - TOUCH * 2,
  height: rect.height - TOUCH * 2,
})

const slabRange = (from: number, span: number, low: number, high: number): [number, number] => {
  if (span !== 0) {
    const first = (low - from) / span
    const second = (high - from) / span
    return first <= second ? [first, second] : [second, first]
  }
  return from >= low && from <= high ? [0, 1] : [1, 0]
}

const crosses = (segment: Segment, box: Rect): boolean => {
  const rect = shrink(box)
  if (rect.width <= 0 || rect.height <= 0) return false
  const { from, to } = segment
  const [minX, maxX] = slabRange(from.x, to.x - from.x, rect.x, rect.x + rect.width)
  const [minY, maxY] = slabRange(from.y, to.y - from.y, rect.y, rect.y + rect.height)
  const enter = Math.max(0, minX, minY)
  const leave = Math.min(1, maxX, maxY)
  return enter < leave
}

const kinIndex = (nodes: readonly ExpandedNode[]): Map<string, Set<string>> => {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const kin = new Map(nodes.map((node) => [node.id, new Set([node.id])]))
  for (const node of nodes) {
    let cursor = node.parentId
    while (cursor !== null) {
      kin.get(node.id)?.add(cursor)
      kin.get(cursor)?.add(node.id)
      cursor = byId.get(cursor)?.parentId ?? null
    }
  }
  return kin
}

type Cut = { edge: string; node: string }

type RenderedEdge = { id: string; source: string; target: string; data?: unknown }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isPoint = (value: unknown): value is Point =>
  isRecord(value) && typeof value.x === "number" && typeof value.y === "number"

const pointsOf = (edge: RenderedEdge): Point[] => {
  if (!isRecord(edge.data)) return []
  const points = edge.data.points
  return Array.isArray(points) ? points.filter(isPoint) : []
}

const pathOf = (edge: RenderedEdge, source: Rect, target: Rect): Point[] => {
  const geometry = {
    source: exitPoint(source),
    target: entryPoint(target),
    sourceSide: "right" as const,
    targetSide: "left" as const,
  }
  const chain = routeChain(geometry, pointsOf(edge))
  if (chain.length >= 3) return chain
  return smoothStepPoints(geometry.source, geometry.target)
}

const cutsOf = (
  nodes: readonly ExpandedNode[],
  edges: readonly RenderedEdge[],
  rects: ReadonlyMap<string, Rect>,
): Cut[] => {
  const kin = kinIndex(nodes)
  const boxes = nodes.flatMap((node) => {
    const rect = rects.get(node.id)
    return rect === undefined ? [] : [{ id: node.id, rect }]
  })
  const found: Cut[] = []

  for (const edge of edges) {
    const source = rects.get(edge.source)
    const target = rects.get(edge.target)
    if (source === undefined || target === undefined) continue
    if (edge.source === edge.target) continue
    const segments = segmentsOf(pathOf(edge, source, target))
    const ends = new Set([...(kin.get(edge.source) ?? []), ...(kin.get(edge.target) ?? [])])
    for (const box of boxes) {
      if (ends.has(box.id)) continue
      if (!segments.some((segment) => crosses(segment, box.rect))) continue
      found.push({ edge: edge.id, node: box.id })
    }
  }
  return found
}

const cutsIn = (flow: SynthesizedFlow): Cut[] => {
  const scene = buildScene(flow.ir)
  const frame = buildFrame(scene, OPEN, NO_MEASURES)
  const placement = placeGraph(scene.graph, OPEN, NO_MEASURES)
  return cutsOf(placement.visible, frame.edges, placement.layout.rects)
}

const WATCHED = ["hotel_pitch", "diverge_merge", "deep_composition"]

describe("рёбра не режут чужие узлы", () => {
  test("образцы заказчика синтезируются", () => {
    const ids = new Set(flows.map((flow) => flow.id))
    expect(WATCHED.filter((id) => !ids.has(id))).toEqual([])
  })

  test.each(flows.map((flow) => [flow.id, flow] as const))("%s", (_id, flow) => {
    expect(cutsIn(flow)).toEqual([])
  })
})
