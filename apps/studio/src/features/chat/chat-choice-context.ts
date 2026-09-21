import { createContext, useContext, type Dispatch, type SetStateAction } from "react"
import type { ApiChatBackendKind, ApiChatModelCatalog } from "@/domain"
import type { ChatChoice } from "./chat-choice"

export type ChatChoiceControl = {
  readonly backend: ApiChatBackendKind
  readonly choice: ChatChoice
  readonly disabled: boolean
  readonly onChange: Dispatch<SetStateAction<ChatChoice>>
  readonly loadModels: (backend: ApiChatBackendKind) => Promise<ApiChatModelCatalog>
}

export const ChatChoiceContext = createContext<ChatChoiceControl | null>(null)

export function useChatChoice(): ChatChoiceControl | null {
  return useContext(ChatChoiceContext)
}
