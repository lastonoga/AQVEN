import { describe, expect, test } from "vitest"
import { buildRunTree } from "./run-tree.js"
import { foldRun } from "../run/events.js"
import type { RunEvent } from "../api/index.js"

const at = (seq: number, type: string, nodeId: string | undefined, payload: unknown, when: number): RunEvent => ({
  seq,
  at: when,
  type,
  nodeId,
  payload,
})

const tree = (events: readonly RunEvent[]) => buildRunTree(foldRun(events, "ok"), {})

const finish = (seq: number, nodeId: string, when: number, ms: number): RunEvent =>
  at(seq, "node_finish", nodeId, { kind: "llm", status: "ok", ms, output: { a: 1 } }, when)

describe("дерево прогона", () => {
  test("непересекающиеся шаги дают последовательную группу", () => {
    const found = tree([
      at(1, "run_start", undefined, { order: ["a", "b"] }, 0),
      at(2, "node_start", "a", { kind: "llm" }, 0),
      finish(3, "a", 100, 100),
      at(4, "node_start", "b", { kind: "llm" }, 120),
      finish(5, "b", 220, 100),
    ])
    expect(found.groups.map((group) => group.mode)).toEqual(["sequence"])
    expect(found.groups[0]?.items.length).toBe(2)
  })

  test("пересекающиеся по времени шаги дают параллельную группу", () => {
    const found = tree([
      at(1, "run_start", undefined, { order: ["a", "b"] }, 0),
      at(2, "node_start", "a", { kind: "llm" }, 0),
      at(3, "node_start", "b", { kind: "llm" }, 50),
      finish(4, "a", 200, 200),
      finish(5, "b", 240, 190),
    ])
    expect(found.groups.map((group) => group.mode)).toEqual(["parallel"])
    expect(found.groups[0]?.lanes).toBe(2)
  })

  test("ветки живут под своим узлом и не дублируются сверху", () => {
    const found = tree([
      at(1, "run_start", undefined, { order: ["fan", "child"] }, 0),
      at(2, "node_start", "fan", { kind: "parallel" }, 0),
      at(3, "branch_start", "fan", { parentNodeId: "fan", branchKey: "k0", nodeId: "child", startedAt: 10 }, 10),
      at(4, "node_start", "child", { kind: "llm" }, 10),
      finish(5, "child", 90, 80),
      at(6, "branch_finish", "fan", { parentNodeId: "fan", branchKey: "k0", nodeId: "child", status: "ok", ms: 80 }, 90),
      finish(7, "fan", 100, 100),
    ])
    const top = found.groups.flatMap((group) => group.items)
    expect(top.map((item) => item.nodeId)).toEqual(["fan"])
    const branches = top[0]?.groups ?? []
    expect(branches[0]?.mode).toBe("parallel")
    expect(branches[0]?.items[0]?.kind).toBe("branch")
    expect(branches[0]?.items[0]?.durationMs).toBe(80)
  })

  test("итерации цикла образуют группу цикла с причиной остановки", () => {
    const found = tree([
      at(1, "run_start", undefined, { order: ["loop"] }, 0),
      at(2, "node_start", "loop", { kind: "loop" }, 0),
      at(3, "iteration_start", "loop", { parentNodeId: "loop", iter: 0, total: 2 }, 10),
      at(4, "iteration_finish", "loop", { parentNodeId: "loop", iter: 0, total: 2, score: 0.5 }, 60),
      at(5, "iteration_start", "loop", { parentNodeId: "loop", iter: 1, total: 2 }, 60),
      at(
        6,
        "iteration_finish",
        "loop",
        { parentNodeId: "loop", iter: 1, total: 2, score: 0.9, stopReason: "порог взят", selected: true },
        130,
      ),
      finish(7, "loop", 140, 140),
    ])
    const group = found.groups[0]?.items[0]?.groups[0]
    expect(group?.mode).toBe("loop")
    expect(group?.items.length).toBe(2)
    expect(group?.label).toContain("порог взят")
    expect(group?.items[0]?.durationMs).toBe(50)
    expect(group?.items[1]?.selected).toBe(true)
  })

  test("ожидание гейта попадает в дерево отдельным элементом", () => {
    const found = tree([
      at(1, "run_start", undefined, { order: ["gate"] }, 0),
      at(2, "node_start", "gate", { kind: "gate" }, 0),
      at(3, "gate_wait", "gate", { parentNodeId: "gate", role: "committee", waitFor: "human" }, 20),
      finish(4, "gate", 40, 40),
    ])
    const item = found.groups[0]?.items[0]?.groups[0]?.items[0]
    expect(item?.kind).toBe("gate")
    expect(item?.title).toContain("committee")
  })

  test("пустой прогон не роняет дерево", () => {
    expect(tree([]).groups).toEqual([])
  })
})
