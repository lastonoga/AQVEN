import type { ApiChatEffort, ApiChatModel, ApiChatModelCatalog, ApiChatPermissionMode } from "@/domain"

export type ChatChoice = {
  readonly model: string | null
  readonly effort: ApiChatEffort | null
  readonly permissionMode: ApiChatPermissionMode
}

export const DEFAULT_CHAT_CHOICE: ChatChoice = { model: null, effort: null, permissionMode: "accept_edits" }

export const PREFERRED_EFFORT: ApiChatEffort = "high"

export const PERMISSION_MODES: readonly ApiChatPermissionMode[] = ["default", "accept_edits", "plan", "trust"]

export const selectedModel = (catalog: ApiChatModelCatalog | null, model: string | null): ApiChatModel | null =>
  catalog?.models.find((entry) => entry.id === model) ?? null

export const offeredEfforts = (catalog: ApiChatModelCatalog | null, model: string | null): readonly ApiChatEffort[] => {
  const chosen = selectedModel(catalog, model)
  if (chosen !== null) return chosen.efforts.map((entry) => entry.effort)
  const every = (catalog?.models ?? []).flatMap((entry) => entry.efforts.map((item) => item.effort))
  return [...new Set(every)]
}

export const keptEffort = (
  catalog: ApiChatModelCatalog | null,
  model: string | null,
  effort: ApiChatEffort | null,
): ApiChatEffort | null => (effort !== null && offeredEfforts(catalog, model).includes(effort) ? effort : null)

export const catalogDefault = (catalog: ApiChatModelCatalog, choice: ChatChoice): ChatChoice | null => {
  if (choice.model !== null) return null
  const preferred = catalog.models.find((entry) => entry.is_default) ?? catalog.models[0]
  if (preferred === undefined) return null
  const offered = preferred.efforts.map((entry) => entry.effort)
  const effort = offered.includes(PREFERRED_EFFORT) ? PREFERRED_EFFORT : (preferred.default_effort ?? null)
  return { ...choice, model: preferred.id, effort }
}
