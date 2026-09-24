import type { ApiChatEvent } from "@/domain"
import { emptyTranscriptPage } from "./chat-history"
import type { ChatTransport } from "./chat-transport"

export type LiveListener = (event: ApiChatEvent) => void

export const liveOnly = (listeners: LiveListener[]): Pick<ChatTransport, "open" | "transcript"> => ({
  open: (sessionId, onPage, onEvent) => {
    onPage(emptyTranscriptPage(sessionId))
    listeners.push(onEvent)
    return () => {
      listeners.splice(listeners.indexOf(onEvent), 1)
    }
  },
  transcript: (sessionId) => Promise.resolve(emptyTranscriptPage(sessionId)),
})
