import { describe, expect, it } from "vitest"
import type { AgentProbe } from "@/domain"
import { isoDateTime } from "@/data/ids"
import { agentState, anyAgentReady } from "./setup"

const ready: AgentProbe = {
  kind: "claude",
  install: { status: "installed", version: "2.0.44", path: "/usr/local/bin/claude", origin: "system" },
  auth: { status: "signedIn", plan: "Max" },
  tools: { status: "connected", toolCount: 18 },
  checkedAt: isoDateTime("2026-09-17T20:31:13.721168Z"),
}

const signedOut: AgentProbe = { ...ready, auth: { status: "signedOut", loginCommand: "claude login" } }
const missing: AgentProbe = { ...ready, install: { status: "missing", installCommand: "curl -fsSL https://claude.ai/install.sh | bash" } }

describe("agentState", () => {
  it("reads install before sign-in", () => {
    expect(agentState(ready)).toBe("ready")
    expect(agentState(signedOut)).toBe("signIn")
    expect(agentState({ ...signedOut, install: missing.install })).toBe("install")
  })
})

describe("anyAgentReady", () => {
  it("is true when at least one agent is installed and signed in", () => {
    const profile = { kind: "claude", models: [], model: "", effort: null, choices: [], limits: [] } as const
    expect(anyAgentReady([{ probe: signedOut, profile }])).toBe(false)
    expect(anyAgentReady([{ probe: signedOut, profile }, { probe: ready, profile }])).toBe(true)
  })
})
