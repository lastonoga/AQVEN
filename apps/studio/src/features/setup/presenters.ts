import type { AgentChoice, AgentKind, AgentModel, AgentProbe, AgentSetup, PackageRelease, ProviderKey, SetupStep } from "@/domain"
import { SETUP_STEPS } from "@/domain"
import type { Tone } from "@/components/studio"
import { agentReady, type AgentState } from "@/lib/setup"

export type AgentFix = { readonly kind: "install" | "signIn"; readonly command: string }

export type StepNeighbours = { readonly previous: SetupStep | undefined; readonly next: SetupStep | undefined }

export type McpCommands = { readonly claudeCode: string; readonly cursor: string; readonly claudeDesktop: string }

export type UpgradeCommands = { readonly uv: string; readonly pip: string }

export const AGENT_STATE_TONE: Readonly<Record<AgentState, Tone>> = {
  ready: "success",
  signIn: "warning",
  install: "destructive",
}

export const agentFix = (probe: AgentProbe): AgentFix | null => {
  if (probe.install.status === "missing") return { kind: "install", command: probe.install.installCommand }
  if (probe.auth.status === "signedOut") return { kind: "signIn", command: probe.auth.loginCommand }
  return null
}

export const neighboursOf = (step: SetupStep): StepNeighbours => {
  const index = SETUP_STEPS.indexOf(step)
  return { previous: SETUP_STEPS[index - 1], next: SETUP_STEPS[index + 1] }
}

export const readyAgentKinds = (agents: readonly AgentSetup[]): readonly AgentKind[] =>
  agents.filter(({ probe }) => agentReady(probe)).map(({ probe }) => probe.kind)

export const chosenAgent = (preferred: AgentKind | null, agents: readonly AgentSetup[]): AgentKind | null => {
  const ready = readyAgentKinds(agents)
  if (preferred !== null && ready.includes(preferred)) return preferred
  return ready[0] ?? agents[0]?.probe.kind ?? null
}

export const hasProviderKey = (providers: readonly ProviderKey[]): boolean => providers.some((key) => key.source !== null)

const stdioServer = (root: string) => ({ command: "uv", args: ["run", "--directory", root, "aqven", "mcp"] })

export const mcpCommands = (root: string): McpCommands => ({
  claudeCode: "claude mcp add --scope project aqven -- uv run aqven mcp",
  cursor: JSON.stringify({ mcpServers: { aqven: stdioServer(root) } }, null, 2),
  claudeDesktop: JSON.stringify({ mcpServers: { aqven: stdioServer(root) } }, null, 2),
})

export const UPGRADE_COMMANDS: UpgradeCommands = {
  uv: "uv lock --upgrade-package aqven && uv sync",
  pip: "pip install --upgrade aqven",
}

export const updateAvailable = (release: PackageRelease): boolean => release.latest !== release.installed

export const modelOf = (models: readonly AgentModel[], id: string): AgentModel | undefined => models.find((model) => model.id === id)

export const effortFor = (model: AgentModel | undefined, current: string | null): string | null => {
  if (model === undefined) return null
  if (model.efforts.some((effort) => effort.value === current)) return current
  return model.defaultEffort ?? model.efforts[0]?.value ?? null
}

export const descriptionOf = (choices: readonly AgentChoice[], value: string | null): string | null =>
  choices.find((choice) => choice.value === value)?.description ?? null

export const parseLimit = (raw: string): number | null => {
  const value = Number(raw)
  if (raw.trim() === "" || !Number.isFinite(value)) return null
  return value
}
