import { describe, expect, it } from "vitest"
import type { AttentionReason, ExperimentSummary } from "@/domain"
import * as ids from "@/data/ids"
import { activityGroupOf, byActivity, layoutExperiments, localDayStart, type ListLayout } from "./experiment-groups"
import { experimentSummary } from "./test-support"

const DAY_START = Date.parse("2026-09-18T00:00:00Z")

type Seed = {
  readonly last?: string | null
  readonly running?: boolean
  readonly attention?: readonly AttentionReason[]
  readonly archived?: boolean
  readonly failureMode?: string | null
  readonly flow?: string
  readonly local?: boolean
}

const experiment = (id: string, seed: Seed = {}): ExperimentSummary => {
  const flow = ids.flowId(seed.flow ?? "support_case")
  return experimentSummary({
    id: ids.experimentId(id),
    flow,
    subject: { kind: "flow", flow, local: seed.local ?? false },
    failureMode: seed.failureMode === undefined ? "reply_quality" : seed.failureMode,
    archived: seed.archived ?? false,
    activity: {
      created: null,
      last: seed.last === undefined || seed.last === null ? null : ids.isoDateTime(seed.last),
      source: seed.last === undefined || seed.last === null ? null : "files",
      running: seed.running ?? false,
      attention: seed.attention ?? [],
    },
  })
}

const idsOf = (items: readonly ExperimentSummary[]): readonly string[] => items.map((item) => item.id)

const shape = (layout: ListLayout) => ({
  open: layout.open.map((section) => [section.key, idsOf(section.items)]),
  older: idsOf(layout.older),
  archived: idsOf(layout.archived),
})

const PROJECT: readonly ExperimentSummary[] = [
  experiment("old_look", { last: "2026-09-10T09:00:00Z" }),
  experiment("fresh_idea", { last: "2026-09-18T08:00:00Z" }),
  experiment("paused_spend", { last: "2026-09-17T12:00:00Z", attention: ["spend_cap_pause"] }),
  experiment("live_run", { last: "2026-09-16T12:00:00Z", running: true, attention: ["check_errors"] }),
  experiment("never_touched", { last: null }),
  experiment("put_away", { last: "2026-09-18T09:00:00Z", archived: true, running: true }),
  experiment("broken_today", { last: "2026-09-18T07:00:00Z", attention: ["check_errors"], failureMode: null }),
  experiment("edited_today", { last: "2026-09-18T06:00:00Z", flow: "judge_panel", failureMode: "panel_wrong_winner" }),
]

describe("activity groups", () => {
  it("files every active experiment in one group, running first, then needs you, then changed today, the rest older", () => {
    expect(shape(layoutExperiments(PROJECT, "activity", DAY_START))).toEqual({
      open: [
        ["activity:running", ["live_run"]],
        ["activity:needsYou", ["broken_today", "paused_spend"]],
        ["activity:today", ["fresh_idea", "edited_today"]],
      ],
      older: ["old_look", "never_touched"],
      archived: ["put_away"],
    })
  })

  it("puts an experiment changed exactly at the start of the day under today and one just before under older", () => {
    expect(activityGroupOf(experiment("at_midnight", { last: "2026-09-18T00:00:00Z" }), DAY_START)).toBe("today")
    expect(activityGroupOf(experiment("before_midnight", { last: "2026-09-17T23:59:59Z" }), DAY_START)).toBeNull()
  })

  it("leaves out the groups nobody is in", () => {
    const quiet = [experiment("old_look", { last: "2026-09-10T09:00:00Z" })]
    expect(shape(layoutExperiments(quiet, "activity", DAY_START))).toEqual({ open: [], older: ["old_look"], archived: [] })
  })
})

describe("ordering by last activity", () => {
  it("puts the latest activity first, experiments without activity last, and breaks ties by id", () => {
    const tied = [
      experiment("b_tied", { last: "2026-09-12T00:00:00Z" }),
      experiment("none", { last: null }),
      experiment("a_tied", { last: "2026-09-12T00:00:00Z" }),
      experiment("newest", { last: "2026-09-14T00:00:00Z" }),
    ]
    expect(idsOf(tied.toSorted(byActivity))).toEqual(["newest", "a_tied", "b_tied", "none"])
  })
})

describe("flow and failure mode groups", () => {
  it("keeps one section per subject flow with experiment flows last, newest first inside, and nothing older", () => {
    const local = experiment("own_flow", { last: "2026-09-18T10:00:00Z", local: true })
    expect(shape(layoutExperiments([...PROJECT, local], "flow", DAY_START))).toEqual({
      open: [
        ["flow:judge_panel", ["edited_today"]],
        ["flow:support_case", ["fresh_idea", "broken_today", "paused_spend", "live_run", "old_look", "never_touched"]],
        ["flow:", ["own_flow"]],
      ],
      older: [],
      archived: ["put_away"],
    })
  })

  it("keeps one section per failure mode by name with experiments without one last", () => {
    expect(shape(layoutExperiments(PROJECT, "failureMode", DAY_START))).toEqual({
      open: [
        ["failureMode:panel_wrong_winner", ["edited_today"]],
        ["failureMode:reply_quality", ["fresh_idea", "paused_spend", "live_run", "old_look", "never_touched"]],
        ["failureMode:", ["broken_today"]],
      ],
      older: [],
      archived: ["put_away"],
    })
  })
})

describe("localDayStart", () => {
  it("starts the day at local midnight of the given moment", () => {
    const now = new Date(2026, 8, 18, 15, 30)
    expect(localDayStart(now)).toBe(new Date(2026, 8, 18).getTime())
  })
})
