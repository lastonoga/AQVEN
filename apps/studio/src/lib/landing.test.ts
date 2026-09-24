import { describe, expect, it } from "vitest"
import { liveFlows } from "@/mocks/data/project"
import { landingFlow } from "./landing"

describe("landingFlow", () => {
  it("opens the flow with the most recent run", () => {
    expect(landingFlow(liveFlows)).toEqual({ kind: "flow", flowId: "support_case" })
  })

  it("falls back to the largest flow when nothing ran", () => {
    const never = liveFlows.map((flow) => ({ ...flow, last_run: null }))
    expect(landingFlow(never)).toEqual({ kind: "flow", flowId: "support_case" })
  })

  it("sends an empty project to the project page", () => {
    expect(landingFlow([])).toEqual({ kind: "project" })
  })
})

describe("landingFlow with a remembered flow", () => {
  it("opens the remembered flow when the project still has it", () => {
    expect(landingFlow(liveFlows, "judge_panel")).toEqual({ kind: "flow", flowId: "judge_panel" })
  })

  it("ignores a remembered flow the project no longer has", () => {
    expect(landingFlow(liveFlows, "gone_flow")).toEqual({ kind: "flow", flowId: "support_case" })
  })
})
