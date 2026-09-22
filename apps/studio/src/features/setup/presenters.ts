import type { ApiChatStatus, ApiProviderKey, ApiSecret, SetupStep } from "@/domain"
import { SETUP_STEPS } from "@/domain"
import type { Tone } from "@/components/studio"

export type LoginState = ApiChatStatus["state"]
export type SecretSource = NonNullable<ApiProviderKey["source"]>
export type ProviderSource = SecretSource | "missing"

export type StepNeighbours = { readonly previous: SetupStep | undefined; readonly next: SetupStep | undefined }

export type McpCommands = { readonly claudeCode: string; readonly stdio: string }

export type UpgradeCommands = { readonly uv: string; readonly pip: string }

export const LOGIN_STATE_TONE: Readonly<Record<LoginState, Tone>> = {
  logged_in: "success",
  logged_out: "warning",
  unknown: "neutral",
}

export const PROVIDER_SOURCE_TONE: Readonly<Record<ProviderSource, Tone>> = {
  environment: "primary",
  dotenv: "success",
  missing: "neutral",
}

export const keySource = (key: ApiProviderKey | ApiSecret): ProviderSource => key.source ?? "missing"

export const hasProviderKey = (keys: readonly ApiProviderKey[]): boolean => keys.some((key) => key.source !== null)

export const neighboursOf = (step: SetupStep): StepNeighbours => {
  const index = SETUP_STEPS.indexOf(step)
  return { previous: SETUP_STEPS[index - 1], next: SETUP_STEPS[index + 1] }
}

const stdioServer = (root: string) => ({ mcpServers: { aqven: { command: "uv", args: ["run", "--directory", root, "aqven", "mcp"] } } })

export const mcpCommands = (root: string): McpCommands => ({
  claudeCode: "claude mcp add --scope project aqven -- uv run aqven mcp",
  stdio: JSON.stringify(stdioServer(root), null, 2),
})

export const UPGRADE_COMMANDS: UpgradeCommands = {
  uv: "uv lock --upgrade-package aqven && uv sync",
  pip: "pip install --upgrade aqven",
}

export const ANOTHER_PROJECT_COMMAND = "aqven studio"
