import type { AgentProbe, AgentSetup, SetupOverview, WorkflowId, WorkspaceId } from "@/domain"

export type AgentState = "ready" | "signIn" | "install"

export type Landing =
  | { readonly kind: "setup" }
  | { readonly kind: "workflow"; readonly workspaceId: WorkspaceId; readonly workflowId: WorkflowId }

export const agentState = (probe: AgentProbe): AgentState => {
  if (probe.install.status === "missing") return "install"
  if (probe.auth.status === "signedOut") return "signIn"
  return "ready"
}

export const agentReady = (probe: AgentProbe): boolean => agentState(probe) === "ready"

export const anyAgentReady = (agents: readonly AgentSetup[]): boolean => agents.some(({ probe }) => agentReady(probe))

export const landingOf = (overview: SetupOverview): Landing => {
  const workflowId: WorkflowId | undefined = overview.project.workflows[0]?.id
  if (workflowId === undefined) return { kind: "setup" }
  return { kind: "workflow", workspaceId: overview.project.workspaceId, workflowId }
}
