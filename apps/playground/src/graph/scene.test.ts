import { execFileSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { describe, expect, test } from "vitest"
import { buildFrame, buildScene } from "./scene.js"
import { FAN_HEIGHT, FAN_WIDTH, NODE_BASE_HEIGHT, NODE_WIDTH } from "./layout.js"
import type { Ir } from "../api/types.js"
import type { CanvasNode, Frame } from "./scene.js"

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

const every = [...flowsOf("examples/hotel-pitch"), ...flowsOf("examples/patterns")]

const sizeOf = (node: CanvasNode): { width: number; height: number } => {
  if (node.type === "fan") return { width: FAN_WIDTH, height: FAN_HEIGHT }
  if (node.type === "wf") return { width: NODE_WIDTH, height: node.data.height }
  const style = node.style ?? {}
  const width = typeof style.width === "number" ? style.width : NODE_WIDTH
  const height = typeof style.height === "number" ? style.height : NODE_BASE_HEIGHT
  return { width, height }
}

const frameOf = (ir: Ir, collapsed: ReadonlySet<string>): Frame =>
  buildFrame(buildScene(ir), collapsed, new Map())

describe("сцена React Flow собирается корректно", () => {
  test.each(every.map((flow) => [flow.id, flow] as const))("%s: контракт вложенных узлов", (_id, flow) => {
    const scene = buildScene(flow.ir)
    const frame = frameOf(flow.ir, new Set())
    const seen = new Set<string>()
    const ids = new Set(frame.nodes.map((node) => node.id))

    for (const node of frame.nodes) {
      if (node.parentId !== undefined) {
        expect(ids.has(node.parentId)).toBe(true)
        expect(seen.has(node.parentId)).toBe(true)
        expect(node.extent).toBe("parent")
      }
      seen.add(node.id)
    }

    for (const edge of frame.edges) {
      expect(ids.has(edge.source)).toBe(true)
      expect(ids.has(edge.target)).toBe(true)
    }

    expect(frame.columns.length).toBe(scene.ranking.stages.length)
  })

  test.each(every.map((flow) => [flow.id, flow] as const))("%s: группы размечены размером", (_id, flow) => {
    const frame = frameOf(flow.ir, new Set())
    const groups = frame.nodes.filter((node) => node.type === "wfgroup")
    for (const group of groups) {
      const size = sizeOf(group)
      expect(size.width).toBeGreaterThan(0)
      expect(size.height).toBeGreaterThan(0)
    }
  })

  test.each(every.map((flow) => [flow.id, flow] as const))("%s: дети лежат внутри родителя", (_id, flow) => {
    const frame = frameOf(flow.ir, new Set())
    const byId = new Map(frame.nodes.map((node) => [node.id, node]))
    for (const node of frame.nodes) {
      if (node.parentId === undefined) continue
      const parent = byId.get(node.parentId)
      if (parent === undefined) continue
      const own = sizeOf(node)
      const box = sizeOf(parent)
      expect(node.position.x).toBeGreaterThanOrEqual(0)
      expect(node.position.y).toBeGreaterThanOrEqual(0)
      expect(node.position.x + own.width).toBeLessThanOrEqual(box.width + 0.5)
      expect(node.position.y + own.height).toBeLessThanOrEqual(box.height + 0.5)
    }
  })

  test.each(every.map((flow) => [flow.id, flow] as const))("%s: свёрнутая группа прячет потомков", (_id, flow) => {
    const scene = buildScene(flow.ir)
    if (scene.groupIds.length === 0) return
    const frame = frameOf(flow.ir, new Set(scene.groupIds))
    const ids = new Set(frame.nodes.map((node) => node.id))
    for (const group of scene.groupIds) {
      const inner = scene.graph.nodes.filter((node) => node.parentId === group)
      for (const child of inner) expect(ids.has(child.id)).toBe(false)
    }
    for (const node of frame.nodes) {
      if (node.type !== "wfgroup") continue
      expect(node.data.collapsed).toBe(true)
    }
  })

  test.each(every.map((flow) => [flow.id, flow] as const))("%s: слои идут по глубине", (_id, flow) => {
    const scene = buildScene(flow.ir)
    const frame = frameOf(flow.ir, new Set())
    const layer = new Map(frame.nodes.map((node) => [node.id, node.zIndex ?? 0]))
    const depth = new Map(scene.graph.nodes.map((node) => [node.id, node.depth]))
    const groups = frame.nodes.filter((node) => node.type === "wfgroup")

    for (const node of frame.nodes) {
      if (node.parentId === undefined) continue
      expect(layer.get(node.id) ?? 0).toBeGreaterThan(layer.get(node.parentId) ?? 0)
    }

    for (const edge of frame.edges) {
      const own = edge.zIndex ?? 0
      const level = Math.min(depth.get(edge.source) ?? 0, depth.get(edge.target) ?? 0)
      expect(own).toBeLessThan(layer.get(edge.source) ?? 0)
      expect(own).toBeLessThan(layer.get(edge.target) ?? 0)
      const covered = groups.filter((group) => (depth.get(group.id) ?? 0) >= level)
      for (const group of covered) expect(own).toBeLessThan(layer.get(group.id) ?? 0)
    }
  })

  test.each(every.map((flow) => [flow.id, flow] as const))("%s: рёбра получили маркеры", (_id, flow) => {
    const frame = frameOf(flow.ir, new Set())
    for (const edge of frame.edges) {
      expect(edge.markerEnd).toBeDefined()
      expect(edge.style?.stroke).toBeTypeOf("string")
    }
  })
})
