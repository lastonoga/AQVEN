import { describe, expect, it } from "vitest"
import * as ids from "@/data/ids"
import { experimentFlow, flowGroupKey, groupByFlow, seriesFlow } from "./flow-groups"
import { experimentSummary, seriesSummary } from "./test-support"

const SUPPORT_CASE = ids.flowId("support_case")
const JUDGE_PANEL = ids.flowId("judge_panel")

const onFlow = (id: string, flow: typeof SUPPORT_CASE) => experimentSummary({ id: ids.experimentId(id), flow, subject: { kind: "flow", flow } })

const onArm = (id: string, flow: typeof SUPPORT_CASE | null) =>
  experimentSummary({ id: ids.experimentId(id), flow, subject: { kind: "arm", arm: ids.armId("escalation"), range: null } })

describe("groupByFlow", () => {
  it("orders the flows by name, puts arms last and keeps the order of the items inside a flow", () => {
    const experiments = [onArm("arm_b", null), onFlow("reply_b", SUPPORT_CASE), onFlow("panel", JUDGE_PANEL), onFlow("reply_a", SUPPORT_CASE), onArm("arm_a", null)]
    const groups = groupByFlow(experiments, experimentFlow)
    expect(groups.map((group) => [group.flow, group.items.map((item) => item.id)])).toEqual([
      ["judge_panel", ["panel"]],
      ["support_case", ["reply_b", "reply_a"]],
      [null, ["arm_b", "arm_a"]],
    ])
    expect(groups.map(flowGroupKey)).toEqual(["judge_panel", "support_case", ""])
  })

  it("files an arm experiment under arms even when its cases belong to a flow", () => {
    expect(groupByFlow([onArm("escalation", SUPPORT_CASE)], experimentFlow).map((group) => group.flow)).toEqual([null])
  })

  it("files a range experiment under the flow of its range", () => {
    expect(experimentFlow(experimentSummary({}))).toBe("support_case")
  })

  it("groups series by their flow and shows no group for an empty list", () => {
    const series = [seriesSummary({ id: ids.seriesId("arm"), flow: null }), seriesSummary({ id: ids.seriesId("reply") })]
    expect(groupByFlow(series, seriesFlow).map((group) => [group.flow, group.items.map((item) => item.id)])).toEqual([
      ["support_case", ["reply"]],
      [null, ["arm"]],
    ])
    expect(groupByFlow([], seriesFlow)).toEqual([])
  })
})
