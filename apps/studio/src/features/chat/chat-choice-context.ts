import { createContext, useContext, type Dispatch, type SetStateAction } from "react"
import type { ApiChatBackendKind, ApiChatModelCatalog, ApiChatSession, ApiChatSessionSettings } from "@/domain"
import type { ChatChoice } from "./chat-choice"

export type ChatChoiceControl = {
  readonly backend: ApiChatBackendKind
  readonly session: ApiChatSession | null
  readonly choice: ChatChoice
  readonly disabled: boolean
  readonly onChange: Dispatch<SetStateAction<ChatChoice>>
  readonly loadModels: (backend: ApiChatBackendKind) => Promise<ApiChatModelCatalog>
  readonly applyToSession: (settings: ApiChatSessionSettings) => void
}

export const ChatChoiceContext = createContext<ChatChoiceControl | null>(null)

export function useChatChoice(): ChatChoiceControl | null {
  return useContext(ChatChoiceContext)
}
