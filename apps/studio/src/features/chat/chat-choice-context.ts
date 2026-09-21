import { createContext, useContext } from "react"
import type { ApiChatBackendKind, ApiChatModelCatalog } from "@/domain"
import type { ChatChoice } from "./chat-choice"

export type ChatChoiceControl = {
  readonly backend: ApiChatBackendKind
  readonly choice: ChatChoice
  readonly disabled: boolean
  readonly onChange: (choice: ChatChoice) => void
  readonly loadModels: (backend: ApiChatBackendKind) => Promise<ApiChatModelCatalog>
}

export const ChatChoiceContext = createContext<ChatChoiceControl | null>(null)

export function useChatChoice(): ChatChoiceControl | null {
  return useContext(ChatChoiceContext)
}
