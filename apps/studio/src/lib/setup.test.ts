import { describe, expect, it } from "vitest"
import { firstRunOverview, setupOverview } from "@/mocks/data/setup"
import { agentState, landingOf } from "./setup"

const ready = setupOverview.agents[0]?.probe
const signedOut = firstRunOverview.agents[0]?.probe

describe("agentState", () => {
  it("reads install before sign-in", () => {
    expect(ready && agentState(ready)).toBe("ready")
    expect(signedOut && agentState(signedOut)).toBe("signIn")
    expect(ready && agentState({ ...ready, install: { status: "missing", installCommand: "curl -fsSL https://claude.ai/install.sh | bash" } })).toBe(
      "install",
    )
  })
})

describe("landingOf", () => {
  it("opens the first workflow of the launched project", () => {
    expect(landingOf(setupOverview)).toEqual({ kind: "workflow", workspaceId: "hotel_pitch", workflowId: "pitch_pipeline" })
  })

  it("sends a project without workflows to setup", () => {
    expect(landingOf(firstRunOverview)).toEqual({ kind: "setup" })
  })
})
