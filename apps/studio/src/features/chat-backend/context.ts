import { createContext, useContext } from "react"
import type { ApiChatBackendKind } from "@/domain"

export type BackendSelection = {
  readonly backend: ApiChatBackendKind | null
  readonly pending: ApiChatBackendKind | null
  readonly error: string | null
  readonly select: (backend: ApiChatBackendKind) => Promise<boolean>
  readonly retry: () => void
}

export const BackendSelectionContext = createContext<BackendSelection | null>(null)

export function useChatBackend(): BackendSelection {
  const selection = useContext(BackendSelectionContext)
  if (selection === null) throw new Error("ChatBackendProvider is required")
  return selection
}
