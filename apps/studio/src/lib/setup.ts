import type { AgentProbe, AgentSetup } from "@/domain"

export type AgentState = "ready" | "signIn" | "install"

export const agentState = (probe: AgentProbe): AgentState => {
  if (probe.install.status === "missing") return "install"
  if (probe.auth.status === "signedOut") return "signIn"
  return "ready"
}

export const agentReady = (probe: AgentProbe): boolean => agentState(probe) === "ready"

export const anyAgentReady = (agents: readonly AgentSetup[]): boolean => agents.some(({ probe }) => agentReady(probe))
