import { describe, expect, it } from "vitest"
import * as ids from "@/data/ids"
import { experimentFlow, flowGroupKey, groupByFlow } from "./flow-groups"
import { experimentSummary } from "./test-support"

const SUPPORT_CASE = ids.flowId("support_case")
const JUDGE_PANEL = ids.flowId("judge_panel")

const onFlow = (id: string, flow: typeof SUPPORT_CASE) => experimentSummary({ id: ids.experimentId(id), flow, subject: { kind: "flow", flow, local: false } })

const onLocal = (id: string, flow: typeof SUPPORT_CASE | null) =>
  experimentSummary({ id: ids.experimentId(id), flow, subject: { kind: "flow", flow: ids.flowId("escalation"), local: true } })

describe("groupByFlow", () => {
  it("orders the flows by name, puts experiment flows last and keeps the order of the items inside a flow", () => {
    const experiments = [onLocal("local_b", null), onFlow("reply_b", SUPPORT_CASE), onFlow("panel", JUDGE_PANEL), onFlow("reply_a", SUPPORT_CASE), onLocal("local_a", null)]
    const groups = groupByFlow(experiments, experimentFlow)
    expect(groups.map((group) => [group.flow, group.items.map((item) => item.id)])).toEqual([
      ["judge_panel", ["panel"]],
      ["support_case", ["reply_b", "reply_a"]],
      [null, ["local_b", "local_a"]],
    ])
    expect(groups.map(flowGroupKey)).toEqual(["judge_panel", "support_case", ""])
  })

  it("files an experiment on a flow of its own under experiment flows even when its cases belong to a flow", () => {
    expect(groupByFlow([onLocal("escalation", SUPPORT_CASE)], experimentFlow).map((group) => group.flow)).toEqual([null])
  })

  it("files a range experiment under the flow of its range", () => {
    expect(experimentFlow(experimentSummary({}))).toBe("support_case")
  })

  it("shows no group for an empty list", () => {
    expect(groupByFlow([], experimentFlow)).toEqual([])
  })
})
