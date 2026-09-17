import type { ReactNode } from "react"
import { Surface } from "@/components/studio"
import { ChatSession } from "./chat-session"
import { useChatScope, useChatThread } from "./thread-source"

export type ChatPanelProps = { readonly header: ReactNode }

export function ChatPanel({ header }: ChatPanelProps) {
  const thread = useChatThread()
  const scope = useChatScope()
  return (
    <Surface variant="plain" className="dark flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {header}
      <ChatSession key={scope} thread={thread} />
    </Surface>
  )
}
