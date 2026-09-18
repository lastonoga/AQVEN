import { describe, expect, it } from "vitest"
import type { ApiFlowDetail, RunStatus } from "@/domain"
import { RUN_STATUS_TONE } from "@/components/studio"
import { flowId } from "@/data/ids"
import { liveFlowDetails, liveFlows, liveProject } from "@/mocks/data/project"
import { flowRows, flowStatusTags, projectInitial, projectName, runBadge, type FlowRowCopy, type FlowStatusCopy } from "./presenters"

const SINCE_LABEL = "a while ago"

const rowCopy: FlowRowCopy = {
  nodes: (count) => `${String(count)} nodes`,
  run: (ref) => `run ${ref}`,
  neverRun: "never run",
  since: () => SINCE_LABEL,
}

const statusCopy: FlowStatusCopy = {
  io: (input, output) => `${input} → ${output}`,
  problems: (count) => `${String(count)} problems`,
  neverRun: "never run",
  lastRun: (status) => `last run ${status}`,
  unknownType: "?",
}

const fixtureFlow = (id: string): ApiFlowDetail => {
  const flow = liveFlowDetails[id]
  if (flow === undefined) throw new Error(`no flow fixture for ${id}`)
  return flow
}

const lastRunOf = (flow: ApiFlowDetail): NonNullable<ApiFlowDetail["last_run"]> => {
  const run = flow.last_run
  if (run === null) throw new Error(`flow ${flow.flow_id} has no run in the fixture`)
  return run
}

const runRef = (flow: ApiFlowDetail): string => `#${lastRunOf(flow).run_id.slice(-6)}`

const supportCase = fixtureFlow("support_case")
const judgePanel = fixtureFlow("judge_panel")

describe("projectName", () => {
  it("reads the package of the live project", () => {
    expect(projectName(liveProject)).toBe("lumen")
    expect(projectInitial(liveProject)).toBe("L")
  })

  it("falls back to the last segment of the root when the package is unset", () => {
    expect(projectName({ ...liveProject, package: null })).toBe("lumen")
  })
})

describe("flowRows", () => {
  it("joins node count, run reference and relative time into one meta line", () => {
    expect(flowRows(liveFlows, flowId("support_case"), rowCopy).map((row) => row.meta)).toEqual([
      "8 nodes · never run",
      `30 nodes · run ${runRef(supportCase)} · ${SINCE_LABEL}`,
    ])
  })

  it("marks only the current flow and gives it the llm dot", () => {
    expect(flowRows(liveFlows, flowId("support_case"), rowCopy).map((row) => [row.id, row.current, row.dot])).toEqual([
      ["judge_panel", false, "neutral"],
      ["support_case", true, "llm"],
    ])
  })
})

describe("runBadge", () => {
  it.each([
    ["queued", "neutral"],
    ["running", "primary"],
    ["suspended", "warning"],
    ["completed", "success"],
    ["failed", "destructive"],
    ["cancelled", "neutral"],
  ] as const)("maps a %s run to the %s tone", (status: RunStatus, tone) => {
    expect(runBadge({ run_id: "01a0b104-4658-70aa-b49b-7c2586b56d92", status, started_at: "2026-09-17T20:17:22.522000Z" })).toEqual({
      label: "#b56d92",
      full: "01a0b104-4658-70aa-b49b-7c2586b56d92",
      status,
      tone,
    })
  })

  it("keeps uuids that share a timestamp prefix apart", () => {
    const started_at = "2026-09-17T20:17:22.522000Z"
    const first = runBadge({ run_id: "01a0b104-4658-70aa-b49b-7c2586b56d92", status: "completed", started_at })
    const second = runBadge({ run_id: "01a0b104-41b6-777e-89e2-4d0d9d904016", status: "completed", started_at })
    expect([first.label, second.label]).toEqual(["#b56d92", "#904016"])
  })
})

describe("flowStatusTags", () => {
  it("shows the input to output contract and the last run of a clean flow", () => {
    expect(flowStatusTags(supportCase, statusCopy)).toEqual([
      { id: "io", label: "CaseRequest → CaseOutcome", tone: "neutral" },
      { id: "run", label: `last run ${lastRunOf(supportCase).status}`, tone: RUN_STATUS_TONE[lastRunOf(supportCase).status] },
    ])
  })

  it("says never run for a flow the engine has no run for", () => {
    expect(flowStatusTags(judgePanel, statusCopy)[1]).toEqual({ id: "run", label: "never run", tone: "neutral" })
  })

  it("adds a destructive problems chip when the flow has errors", () => {
    const broken: ApiFlowDetail = { ...supportCase, problems: { error: 2, warning: 1, info: 0 } }
    expect(flowStatusTags(broken, statusCopy)[1]).toEqual({ id: "problems", label: "3 problems", tone: "destructive" })
  })
})
