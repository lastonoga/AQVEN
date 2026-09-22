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
