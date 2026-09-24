import { describe, expect, it } from "vitest"
import { liveNodes } from "@/mocks/data/nodes"
import { COMPLETED_RUN_ID, liveRunEvents, liveRunSnapshots } from "@/mocks/data/runs"
import { buildTrace } from "./build"
import { failedBelow, itemFailures, stageFailedBelow, stageItemFailures } from "./failures"
import type { StageRun } from "./model"
import { stageTone } from "./paint"

const snapshot = liveRunSnapshots[COMPLETED_RUN_ID]

const trace = buildTrace({
  executions: snapshot?.executions ?? [],
  order: snapshot?.order ?? [],
  nodes: liveNodes["support_case"] ?? [],
  prompts: {},
  events: liveRunEvents[COMPLETED_RUN_ID] ?? [],
})

const stage = (nodeId: string): StageRun => {
  const found = trace.stages.find((item) => item.nodeId === nodeId)
  if (found === undefined) throw new Error(`no stage ${nodeId}`)
  return found
}

const judges = () => stage("panel").groups[0]?.columns.find((column) => column.name === "judges")?.child ?? null

describe("item failures", () => {
  it("counts the failed branches of a parallel node against all of its branches", () => {
    const child = judges()
    expect(child === null ? null : itemFailures(child.kind, child.group.columns)).toEqual({ failed: 1, total: 3 })
  })

  it("stays silent for a container whose items all succeeded", () => {
    expect(stageItemFailures(stage("drafts"))).toBeNull()
  })

  it("does not count the steps of a called flow as items", () => {
    expect(stageItemFailures(stage("panel"))).toBeNull()
  })

  it("finds a failure nested anywhere below a stage", () => {
    expect(stageFailedBelow(stage("panel"))).toBe(1)
    expect(failedBelow(stage("drafts").groups.flatMap((group) => group.columns))).toBe(0)
  })

  it("paints a stage that finished but lost a nested call as a warning", () => {
    expect(stage("panel").status).toBe("ok")
    expect(stageTone(stage("panel"))).toBe("warning")
    expect(stageTone(stage("drafts"))).toBe("success")
  })
})
