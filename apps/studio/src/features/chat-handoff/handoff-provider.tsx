import { useState, type ReactNode } from "react"
import type { ChatSessionId } from "@/domain"
import { ChatHandoffContext, type HandoffSignal } from "./handoff-context"

export type ChatHandoffProviderProps = {
  readonly children: ReactNode
  readonly onAnnounce?: (session: ChatSessionId) => void
}

export function ChatHandoffProvider({ children, onAnnounce }: ChatHandoffProviderProps) {
  const [signal, setSignal] = useState<HandoffSignal | null>(null)
  const announce = (session: ChatSessionId): void => {
    setSignal((current) => ({ session, seq: (current?.seq ?? 0) + 1 }))
    onAnnounce?.(session)
  }
  return <ChatHandoffContext value={{ signal, announce }}>{children}</ChatHandoffContext>
}
