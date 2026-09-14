import { execFileSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { describe, expect, test } from "vitest"
import { buildFrame, buildScene } from "./scene.js"
import { placeGraph } from "./frame-layout.js"
import { labelTargets } from "./edges.js"
import {
  LABEL_GAP,
  LABEL_HEIGHT,
  LABEL_MAX_CHARS,
  labelObstacles,
  labelRect,
  labelSize,
  placeLabel,
  placeLabels,
} from "./edge-label.js"
import { GROUP_HEADER, overlaps } from "./layout.js"
import type { Ir } from "../api/types.js"
import type { Point } from "./edge-route.js"
import type { Rect } from "./layout.js"
import type { LabelTarget } from "./edge-label.js"

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, "../../../..")
const scanner = pathToFileURL(resolve(repo, "packages/cli/dist/scan.js")).href

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

const WATCHED = ["diverge_judge_select", "hotel_pitch", "deep_composition"]

type PlacedLabel = { id: string; rect: Rect }

type Clash = { label: string; hit: string }

const placedIn = (flow: SynthesizedFlow): { labels: PlacedLabel[]; hidden: string[]; boxes: Rect[] } => {
  const scene = buildScene(flow.ir)
  const frame = buildFrame(scene, OPEN, NO_MEASURES)
  const rects = placeGraph(scene.graph, OPEN, NO_MEASURES).layout.rects
  const frames = new Set(scene.groupIds)
  const targets = labelTargets(frame.edges, rects)
  const spots = placeLabels(targets, labelObstacles(rects, frames))
  const labels = targets.flatMap((target) => {
    const spot = spots.get(target.id) ?? null
    return spot === null ? [] : [{ id: target.id, rect: labelRect(spot, target.text) }]
  })
  const hidden = targets.filter((target) => (spots.get(target.id) ?? null) === null).map((t) => t.id)
  return { labels, hidden, boxes: labelObstacles(rects, frames) }
}

const boxClashes = (labels: readonly PlacedLabel[], boxes: readonly Rect[]): Clash[] =>
  labels.flatMap((label) =>
    boxes.filter((box) => overlaps(label.rect, box)).map(() => ({ label: label.id, hit: "box" })),
  )

const pairClashes = (labels: readonly PlacedLabel[]): Clash[] =>
  labels.flatMap((label, index) =>
    labels
      .slice(index + 1)
      .filter((other) => overlaps(label.rect, other.rect))
      .map((other) => ({ label: label.id, hit: other.id })),
  )

const chainOf = (points: readonly Point[]): LabelTarget => ({
  id: "probe",
  text: "temperature = 0.3",
  anchor: "source",
  chain: points,
})

const nearestGap = (center: Point, chain: readonly Point[]): number =>
  Math.min(
    ...chain.slice(1).map((to, index) => {
      const from = chain[index] ?? to
      const run = { x: to.x - from.x, y: to.y - from.y }
      const length = run.x * run.x + run.y * run.y
      const raw = length === 0 ? 0 : ((center.x - from.x) * run.x + (center.y - from.y) * run.y) / length
      const share = Math.max(0, Math.min(1, raw))
      return Math.hypot(center.x - from.x - run.x * share, center.y - from.y - run.y * share)
    }),
  )

describe("плашка подписи", () => {
  test("ширина растёт по тексту и упирается в предел", () => {
    expect(labelSize("ab").width).toBeLessThan(labelSize("abcdef").width)
    expect(labelSize("x".repeat(80)).width).toBe(labelSize("x".repeat(LABEL_MAX_CHARS)).width)
    expect(labelSize("accept").height).toBe(LABEL_HEIGHT)
  })

  test("прямоугольник центрирован на точке крепления", () => {
    const rect = labelRect({ x: 100, y: 50 }, "accept")
    expect(rect.x + rect.width / 2).toBeCloseTo(100)
    expect(rect.y + rect.height / 2).toBeCloseTo(50)
  })

  test("у группы препятствие — шапка и рамка, а не вся площадь", () => {
    const rects = new Map<string, Rect>([["g", { x: 0, y: 0, width: 400, height: 300 }]])
    const boxes = labelObstacles(rects, new Set(["g"]))
    const middle = { x: 100, y: 100, width: 120, height: 18 }
    const header = { x: 100, y: GROUP_HEADER - 10, width: 120, height: 18 }
    expect(boxes.some((box) => overlaps(middle, box))).toBe(false)
    expect(boxes.some((box) => overlaps(header, box))).toBe(true)
  })
})

describe("место подписи", () => {
  const straight = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
  ]

  test("подпись стоит рядом с линией, а не на ней", () => {
    const spot = placeLabel(chainOf(straight), [], [])
    expect(spot).not.toBeNull()
    expect(nearestGap(spot ?? { x: 0, y: 0 }, straight)).toBeCloseTo(LABEL_HEIGHT / 2 + LABEL_GAP)
  })

  test("точка крепления не садится на поворот", () => {
    const bend = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 300 },
    ]
    const spot = placeLabel({ ...chainOf(bend), anchor: "center" }, [], [])
    expect(spot).not.toBeNull()
    expect(Math.hypot((spot?.x ?? 0) - 200, spot?.y ?? 0)).toBeGreaterThan(LABEL_GAP)
  })

  test("веер подписывается на своей ветке, а не на общем стволе", () => {
    const branch = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 300 },
      { x: 120, y: 300 },
    ]
    const spot = placeLabel(chainOf(branch), [], [])
    expect(spot).not.toBeNull()
    expect(spot?.y ?? 0).toBeGreaterThan(0)
  })

  test("занятый прямоугольник узла сдвигает подпись дальше по маршруту", () => {
    const block: Rect = { x: -60, y: -60, width: 200, height: 120 }
    const spot = placeLabel(chainOf(straight), [block], [])
    expect(spot).not.toBeNull()
    expect(overlaps(labelRect(spot ?? { x: 0, y: 0 }, "temperature = 0.3"), block)).toBe(false)
  })

  test("без свободного места подпись прячется", () => {
    const wall: Rect = { x: -500, y: -500, width: 2000, height: 1000 }
    expect(placeLabel(chainOf(straight), [wall], [])).toBeNull()
  })

  test("две подписи на одном маршруте не наезжают друг на друга", () => {
    const targets: LabelTarget[] = [
      { ...chainOf(straight), id: "first" },
      { ...chainOf(straight), id: "second" },
    ]
    const spots = placeLabels(targets, [])
    const first = spots.get("first")
    const second = spots.get("second")
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    if (first === null || first === undefined || second === null || second === undefined) return
    expect(overlaps(labelRect(first, targets[0]?.text ?? ""), labelRect(second, targets[1]?.text ?? ""))).toBe(
      false,
    )
  })
})

describe("подписи не пересекают узлы и друг друга", () => {
  test("образцы заказчика синтезируются", () => {
    const ids = new Set(flows.map((flow) => flow.id))
    expect(WATCHED.filter((id) => !ids.has(id))).toEqual([])
  })

  test.each(flows.map((flow) => [flow.id, flow] as const))("%s", (_id, flow) => {
    const { labels, boxes } = placedIn(flow)
    expect(boxClashes(labels, boxes)).toEqual([])
    expect(pairClashes(labels)).toEqual([])
  })

  test("веер diverge_judge_select подписан целиком", () => {
    const flow = flows.find((candidate) => candidate.id === "diverge_judge_select")
    expect(flow).toBeDefined()
    if (flow === undefined) return
    const { labels, hidden } = placedIn(flow)
    expect(hidden).toEqual([])
    expect(labels.length).toBe(3)
  })

  test.each(WATCHED.map((id) => [id] as const))("%s показывает подписи", (id) => {
    const flow = flows.find((candidate) => candidate.id === id)
    expect(flow).toBeDefined()
    if (flow === undefined) return
    expect(placedIn(flow).labels.length).toBeGreaterThan(0)
  })
})
