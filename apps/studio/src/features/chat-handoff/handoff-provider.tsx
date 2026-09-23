import { useState, type ReactNode } from "react"
import type { ChatSessionId } from "@/domain"
import { ChatHandoffContext, type HandoffSignal } from "./handoff-context"

export function ChatHandoffProvider({ children }: { readonly children: ReactNode }) {
  const [signal, setSignal] = useState<HandoffSignal | null>(null)
  const announce = (session: ChatSessionId): void => {
    setSignal((current) => ({ session, seq: (current?.seq ?? 0) + 1 }))
  }
  return <ChatHandoffContext value={{ signal, announce }}>{children}</ChatHandoffContext>
}
