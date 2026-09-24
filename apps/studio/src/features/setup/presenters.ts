import type { ApiChatBackendKind, ApiChatStatus, ApiProviderKey, ApiResearchBudget, ApiSecret, ApiSetting, SettingRejectionCode, SettingScope, SetupStep } from "@/domain"
import { SETTING_REJECTION_CODES, SETUP_STEPS } from "@/domain"
import type { Tone } from "@/components/studio"
import { ApiError } from "@/api/client"
import { messageOf } from "@/lib/errors"
import { usd } from "@/lib/format"

export type LoginState = ApiChatStatus["state"]
export type SecretSource = NonNullable<ApiProviderKey["source"]>
export type KeyOrigin = SecretSource | "missing"

export type KeyEntry = Pick<ApiProviderKey, "setting_key" | "env_var" | "source" | "masked">

export type SecretUser = { readonly scope: ApiSecret["scope"]; readonly name: string }

export type ProjectSecret = KeyEntry & { readonly users: readonly SecretUser[] }

export type SaveFailure =
  | { readonly kind: "rejected"; readonly code: SettingRejectionCode }
  | { readonly kind: "failed"; readonly message: string }

export type StepNeighbours = { readonly previous: SetupStep | undefined; readonly next: SetupStep | undefined }

export type McpCommands = { readonly claudeCode: string; readonly stdio: string }

export const LOGIN_STATE_TONE: Readonly<Record<LoginState, Tone>> = {
  logged_in: "success",
  logged_out: "warning",
  unknown: "neutral",
}

export const LOGIN_COMMANDS: Readonly<Record<ApiChatBackendKind, string>> = {
  claude: "claude auth login",
  codex: "codex login",
}

export const UPGRADE_COMMAND = "uv lock --upgrade-package aqven && uv sync"

export const SPEND_CAP_SETTING = "research.spend_cap_usd"
export const SPEND_CAP_SCOPE: SettingScope = "project"

const CAP_DRAFT = /^\d+(\.\d+)?$/

export const keyOrigin = (entry: KeyEntry): KeyOrigin => entry.source ?? "missing"

export const hasProviderKey = (keys: readonly ApiProviderKey[]): boolean => keys.some((key) => key.source !== null)

export const dotenvKeys = (stored: readonly ApiSetting[]): ReadonlySet<string> =>
  new Set(stored.filter((setting) => setting.kind === "secret").map((setting) => setting.key))

export const isShadowed = (entry: KeyEntry, dotenv: ReadonlySet<string>): boolean =>
  entry.source === "environment" && dotenv.has(entry.setting_key)

const userOf = (secret: ApiSecret): SecretUser => ({ scope: secret.scope, name: secret.declared_by })

const projectSecret = (secret: ApiSecret): ProjectSecret => ({
  setting_key: secret.setting_key,
  env_var: secret.env_var,
  source: secret.source,
  masked: secret.masked,
  users: [userOf(secret)],
})

const withUser = (current: ProjectSecret | undefined, secret: ApiSecret): ProjectSecret =>
  current === undefined ? projectSecret(secret) : { ...current, users: [...current.users, userOf(secret)] }

export const otherSecrets = (secrets: readonly ApiSecret[], providers: readonly ApiProviderKey[]): readonly ProjectSecret[] => {
  const providerKeys = new Set(providers.map((provider) => provider.setting_key))
  const grouped = new Map<string, ProjectSecret>()
  secrets
    .filter((secret) => secret.scope !== "provider" && !providerKeys.has(secret.setting_key))
    .forEach((secret) => {
      grouped.set(secret.setting_key, withUser(grouped.get(secret.setting_key), secret))
    })
  return [...grouped.values()]
}

const isRejectionCode = (code: string): code is SettingRejectionCode => SETTING_REJECTION_CODES.some((known) => known === code)

const rejectionCodeOf = (reason: unknown): SettingRejectionCode | undefined =>
  reason instanceof ApiError ? reason.problems.map((problem) => problem.code).find(isRejectionCode) : undefined

export const saveFailureOf = (reason: unknown): SaveFailure => {
  const code = rejectionCodeOf(reason)
  if (code !== undefined) return { kind: "rejected", code }
  return { kind: "failed", message: messageOf(reason) }
}

export const neighboursOf = (step: SetupStep): StepNeighbours => {
  const index = SETUP_STEPS.indexOf(step)
  return { previous: SETUP_STEPS[index - 1], next: SETUP_STEPS[index + 1] }
}

const SHELL_SAFE = /^[\w@%+=:,./-]+$/

const shellQuoted = (value: string): string => (SHELL_SAFE.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`)

const stdioServer = (root: string) => ({ mcpServers: { aqven: { command: "uv", args: ["run", "--directory", root, "aqven", "mcp"] } } })

export const mcpCommands = (root: string): McpCommands => ({
  claudeCode: `claude mcp add aqven -- uv run --directory ${shellQuoted(root)} aqven mcp`,
  stdio: JSON.stringify(stdioServer(root), null, 2),
})

export const isCapDraft = (draft: string): boolean => CAP_DRAFT.test(draft.trim())

export const capDraftOf = (budget: ApiResearchBudget): string => budget.project_usd ?? budget.default_usd

export const capText = (value: string): string => usd(Number(value))
