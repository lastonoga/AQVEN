import { execFileSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { describe, expect, test } from "vitest"
import { expandIr } from "./expand.js"
import { bodyAt, nodeIndexOf, runIdAt } from "./node-index.js"
import type { Ir } from "../api/types.js"

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, "../../../..")
const scanner = pathToFileURL(resolve(repo, "packages/cli/dist/scan.js")).href

const flowsOf = (dir: string): { id: string; ir: Ir }[] => {
  const script = [
    `import { scan } from ${JSON.stringify(scanner)}`,
    `const report = await scan(${JSON.stringify(resolve(repo, dir))})`,
    `const kept = report.flows.filter((flow) => flow.ir !== undefined)`,
    `process.stdout.write(JSON.stringify(kept.map((flow) => ({ id: flow.id, ir: flow.ir }))))`,
  ].join("\n")
  return JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }),
  ) as { id: string; ir: Ir }[]
}

const every = [...flowsOf("examples/hotel-pitch"), ...flowsOf("examples/patterns")]

describe("выбор узла на канвасе", () => {
  test("каждая вложенная карточка отдаёт тело для инспектора", () => {
    const blind: string[] = []
    for (const flow of every) {
      const index = nodeIndexOf(flow.ir)
      const graph = expandIr(flow.ir)
      const nested = graph.nodes.filter((node) => node.parentId !== null && node.group === null)
      for (const node of nested) {
        if (bodyAt(flow.ir, index, node.id) === null) blind.push(`${flow.id}:${node.id}`)
      }
    }
    expect(blind).toEqual([])
  })

  test("вложенный узел показывает собственное тело, а не тело группы", () => {
    const flow = every.find((entry) => entry.id === "diverge_judge_select")
    expect(flow).toBeDefined()
    if (flow === undefined) return
    const index = nodeIndexOf(flow.ir)
    const graph = expandIr(flow.ir)
    const inner = graph.nodes.find((node) => node.parentId !== null && node.body?.kind === "llm")
    expect(inner).toBeDefined()
    if (inner === undefined) return
    expect(bodyAt(flow.ir, index, inner.id)).toBe(inner.body)
    expect(bodyAt(flow.ir, index, inner.id)).not.toBe(bodyAt(flow.ir, index, inner.parentId ?? ""))
  })

  test("узлы верхнего уровня разрешаются из ir.nodes", () => {
    for (const flow of every) {
      const index = nodeIndexOf(flow.ir)
      for (const id of Object.keys(flow.ir.nodes)) {
        expect(bodyAt(flow.ir, index, id)).toBe(flow.ir.nodes[id])
        expect(runIdAt(index, id)).toBe(id)
      }
    }
  })

  test("вложенный узел сводится к корневому шагу для данных прогона", () => {
    for (const flow of every) {
      const index = nodeIndexOf(flow.ir)
      for (const [id, pick] of index) {
        if (pick.parentId === null) continue
        expect(Object.keys(flow.ir.nodes)).toContain(runIdAt(index, id))
      }
    }
  })
})
