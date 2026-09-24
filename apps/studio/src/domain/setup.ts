import type { IsoDateTime, ProjectRoot } from "./core"

export const AGENT_KINDS = ["claude", "codex"] as const
export type AgentKind = (typeof AGENT_KINDS)[number]

export const SETUP_STEPS = ["agent", "providers", "workflow"] as const
export type SetupStep = (typeof SETUP_STEPS)[number]

export const SETTING_REJECTION_CODES = [
  "SECRET_SCOPE_UNSUPPORTED",
  "NOT_A_SECRET_KEY",
  "SECRET_KEY_NEEDS_SECRET",
  "SECRET_VALUE_INVALID",
] as const
export type SettingRejectionCode = (typeof SETTING_REJECTION_CODES)[number]

export const PROVIDER_NAMES = ["openai", "anthropic", "google", "openrouter", "together"] as const
export type ProviderName = (typeof PROVIDER_NAMES)[number]

export type SecretSource = "project" | "studio" | "environment"

export type AgentInstall =
  | { readonly status: "installed"; readonly version: string; readonly path: string; readonly origin: "system" | "bundled" }
  | { readonly status: "missing"; readonly installCommand: string }

export type AgentAuth =
  | { readonly status: "signedIn"; readonly plan: string }
  | { readonly status: "signedOut"; readonly loginCommand: string }

export type AgentToolsCheck =
  | { readonly status: "connected"; readonly toolCount: number }
  | { readonly status: "failed"; readonly reason: string }
  | { readonly status: "pending" }

export type AgentProbe = {
  readonly kind: AgentKind
  readonly install: AgentInstall
  readonly auth: AgentAuth
  readonly tools: AgentToolsCheck
  readonly checkedAt: IsoDateTime
}

export type ProjectInfo = {
  readonly root: ProjectRoot
  readonly name: string
  readonly git: { readonly branch: string; readonly dirty: boolean } | null
  readonly configFile: string | null
}

export const AGENT_CHOICE_FIELDS = ["reasoning", "approvals", "sandbox"] as const
export type AgentChoiceFieldId = (typeof AGENT_CHOICE_FIELDS)[number]

export const AGENT_LIMIT_FIELDS = ["maxTurns", "maxBudgetUsd"] as const
export type AgentLimitFieldId = (typeof AGENT_LIMIT_FIELDS)[number]

export type AgentChoice = { readonly value: string; readonly description: string | null }

export type AgentModel = {
  readonly id: string
  readonly label: string
  readonly efforts: readonly AgentChoice[]
  readonly defaultEffort: string | null
}

export type AgentChoiceField = {
  readonly id: AgentChoiceFieldId
  readonly choices: readonly AgentChoice[]
  readonly value: string
}

export type AgentLimitField = {
  readonly id: AgentLimitFieldId
  readonly value: number | null
  readonly min: number
  readonly step: number
}

export type AgentProfile = {
  readonly kind: AgentKind
  readonly models: readonly AgentModel[]
  readonly model: string
  readonly effort: string | null
  readonly choices: readonly AgentChoiceField[]
  readonly limits: readonly AgentLimitField[]
}

export type AgentSetup = { readonly probe: AgentProbe; readonly profile: AgentProfile }

export type ProviderKey = {
  readonly provider: ProviderName
  readonly envVar: string
  readonly source: SecretSource | null
  readonly masked: string | null
}

export type ServerInfo = {
  readonly url: string
  readonly mcpUrl: string
  readonly command: string
  readonly startedAt: IsoDateTime
  readonly projectData: string
  readonly studioData: string
}

export type PackageRelease = {
  readonly installed: string
  readonly latest: string
  readonly checkedAt: IsoDateTime
}

export type SetupOverview = {
  readonly server: ServerInfo
  readonly project: ProjectInfo
  readonly agents: readonly AgentSetup[]
  readonly defaultAgent: AgentKind | null
  readonly providers: readonly ProviderKey[]
  readonly release: PackageRelease
}
