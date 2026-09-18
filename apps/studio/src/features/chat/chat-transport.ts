import type { ApiChatEvent, ApprovalDecision, ChatSessionId } from "@/domain"
import { API_BASE } from "@/api/client"
import { CHAT_EVENT_TYPES } from "./chat-events"

export type ChatTransport = {
  readonly subscribe: (sessionId: ChatSessionId, afterSeq: number, onEvent: (event: ApiChatEvent) => void) => () => void
  readonly send: (sessionId: ChatSessionId, text: string, clientOpId: string) => Promise<void>
  readonly respond: (sessionId: ChatSessionId, approvalId: string, decision: ApprovalDecision, message: string | null) => Promise<void>
  readonly interrupt: (sessionId: ChatSessionId) => Promise<void>
}

export type ChatCalls = {
  readonly send: (sessionId: ChatSessionId, body: { readonly text: string; readonly client_op_id: string }) => Promise<unknown>
  readonly approve: (
    sessionId: ChatSessionId,
    approvalId: string,
    body: { readonly decision: ApprovalDecision; readonly message: string | null },
  ) => Promise<unknown>
  readonly interrupt: (sessionId: ChatSessionId) => Promise<unknown>
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null

const isChatEvent = (value: unknown): value is ApiChatEvent =>
  isRecord(value) && typeof value["seq"] === "number" && typeof value["type"] === "string" && CHAT_EVENT_TYPES.includes(value["type"])

const messageText = (event: Event): string | null => {
  if (!(event instanceof MessageEvent)) return null
  const data: unknown = event.data
  return typeof data === "string" ? data : null
}

const readChatEvent = (event: Event): ApiChatEvent | null => {
  const raw = messageText(event)
  if (raw === null) return null
  const parsed: unknown = JSON.parse(raw)
  return isChatEvent(parsed) ? parsed : null
}

export const chatEventsUrl = (sessionId: ChatSessionId, afterSeq: number): string =>
  `${API_BASE}/chat/sessions/${encodeURIComponent(sessionId)}/events?after_seq=${String(afterSeq)}`

const noSubscription = (): void => undefined

const subscribeToEvents = (sessionId: ChatSessionId, afterSeq: number, onEvent: (event: ApiChatEvent) => void): (() => void) => {
  if (typeof EventSource === "undefined") return noSubscription
  const source = new EventSource(chatEventsUrl(sessionId, afterSeq))
  const receive = (message: Event): void => {
    const event = readChatEvent(message)
    if (event !== null) onEvent(event)
  }
  CHAT_EVENT_TYPES.forEach((type) => {
    source.addEventListener(type, receive)
  })
  return () => {
    source.close()
  }
}

export const chatTransport = (calls: ChatCalls): ChatTransport => ({
  subscribe: subscribeToEvents,
  send: async (sessionId, text, clientOpId) => {
    await calls.send(sessionId, { text, client_op_id: clientOpId })
  },
  respond: async (sessionId, approvalId, decision, message) => {
    await calls.approve(sessionId, approvalId, { decision, message })
  },
  interrupt: async (sessionId) => {
    await calls.interrupt(sessionId)
  },
})
