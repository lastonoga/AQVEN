import { createContext, useContext } from "react"
import type { ChatSessionId } from "@/domain"
import { noop } from "@/lib/noop"

export type HandoffSignal = { readonly session: ChatSessionId; readonly seq: number }

export type HandoffControl = { readonly signal: HandoffSignal | null; readonly announce: (session: ChatSessionId) => void }

export const ChatHandoffContext = createContext<HandoffControl>({ signal: null, announce: noop })

export const useHandoffSignal = (): HandoffSignal | null => useContext(ChatHandoffContext).signal
