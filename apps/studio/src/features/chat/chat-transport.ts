import type { ApiChatApprovalReply, ApiChatEvent, ChatSessionId } from "@/domain"
import { API_BASE } from "@/api/client"
import { isRecord, subscribeEvents, type Unsubscribe } from "@/lib/sse"
import { CHAT_EVENT_TYPES } from "./chat-events"

export type ChatTransport = {
  readonly subscribe: (sessionId: ChatSessionId, afterSeq: number, onEvent: (event: ApiChatEvent) => void) => () => void
  readonly send: (sessionId: ChatSessionId, text: string, clientOpId: string) => Promise<void>
  readonly respond: (sessionId: ChatSessionId, approvalId: string, reply: ApiChatApprovalReply) => Promise<void>
  readonly interrupt: (sessionId: ChatSessionId) => Promise<void>
}

export type ChatCalls = {
  readonly send: (sessionId: ChatSessionId, body: { readonly text: string; readonly client_op_id: string }) => Promise<unknown>
  readonly approve: (sessionId: ChatSessionId, approvalId: string, body: ApiChatApprovalReply) => Promise<unknown>
  readonly interrupt: (sessionId: ChatSessionId) => Promise<unknown>
}

const isChatEvent = (value: unknown): value is ApiChatEvent =>
  isRecord(value) && typeof value["seq"] === "number" && typeof value["type"] === "string" && CHAT_EVENT_TYPES.includes(value["type"])

const chatEventOf = (value: unknown): ApiChatEvent | null => (isChatEvent(value) ? value : null)

export const chatEventsUrl = (sessionId: ChatSessionId, afterSeq: number): string =>
  `${API_BASE}/chat/sessions/${encodeURIComponent(sessionId)}/events?after_seq=${String(afterSeq)}`

const subscribeToEvents = (sessionId: ChatSessionId, afterSeq: number, onEvent: (event: ApiChatEvent) => void): Unsubscribe =>
  subscribeEvents({ url: chatEventsUrl(sessionId, afterSeq), types: CHAT_EVENT_TYPES, read: chatEventOf, onEvent })

export const chatTransport = (calls: ChatCalls): ChatTransport => ({
  subscribe: subscribeToEvents,
  send: async (sessionId, text, clientOpId) => {
    await calls.send(sessionId, { text, client_op_id: clientOpId })
  },
  respond: async (sessionId, approvalId, reply) => {
    await calls.approve(sessionId, approvalId, reply)
  },
  interrupt: async (sessionId) => {
    await calls.interrupt(sessionId)
  },
})
