import type { MessageStatus, ThreadMessageLike } from "@assistant-ui/react"
import type { ChatMessage, ChatMessageStatus, ChatThread } from "@/domain"

const IMPORTED_STATUS: Readonly<Record<ChatMessageStatus["type"], MessageStatus>> = {
  running: { type: "requires-action", reason: "tool-calls" },
  complete: { type: "complete", reason: "stop" },
}

const importMessage = (message: ChatMessage): ThreadMessageLike => {
  if (message.role === "user") return message
  return { ...message, status: IMPORTED_STATUS[message.status.type] }
}

export const importThread = (thread: ChatThread): readonly ThreadMessageLike[] => thread.map(importMessage)
