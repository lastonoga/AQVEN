import type { ApiChatApprovalReply, ApiChatEvent, ApiChatTranscriptPage, ChatSessionId } from "@/domain"
import { chatFeed, followFeed } from "@/api/events"
import { noop } from "@/lib/noop"
import { isRecord, type Unsubscribe } from "@/lib/sse"
import { CHAT_EVENT_TYPES } from "./chat-events"
import { emptyTranscriptPage } from "./chat-history"

export type ChatTransport = {
  readonly open: (
    sessionId: ChatSessionId,
    onPage: (page: ApiChatTranscriptPage) => void,
    onEvent: (event: ApiChatEvent) => void,
  ) => Unsubscribe
  readonly transcript: (sessionId: ChatSessionId, beforeSeq: number) => Promise<ApiChatTranscriptPage>
  readonly send: (sessionId: ChatSessionId, text: string, clientOpId: string) => Promise<void>
  readonly respond: (sessionId: ChatSessionId, approvalId: string, reply: ApiChatApprovalReply) => Promise<void>
  readonly interrupt: (sessionId: ChatSessionId) => Promise<void>
}

export type TranscriptQuery = { readonly before_seq?: number; readonly limit: number }

export type ChatCalls = {
  readonly transcript: (sessionId: ChatSessionId, query: TranscriptQuery) => Promise<ApiChatTranscriptPage>
  readonly send: (sessionId: ChatSessionId, body: { readonly text: string; readonly client_op_id: string }) => Promise<unknown>
  readonly approve: (sessionId: ChatSessionId, approvalId: string, body: ApiChatApprovalReply) => Promise<unknown>
  readonly interrupt: (sessionId: ChatSessionId) => Promise<unknown>
}

export const TRANSCRIPT_TURNS = 20

const isChatEvent = (value: unknown): value is ApiChatEvent =>
  isRecord(value) && typeof value["seq"] === "number" && typeof value["type"] === "string" && CHAT_EVENT_TYPES.includes(value["type"])

const chatEventOf = (value: unknown): ApiChatEvent | null => (isChatEvent(value) ? value : null)

const subscribeToEvents = (sessionId: ChatSessionId, afterSeq: number, onEvent: (event: ApiChatEvent) => void): Unsubscribe =>
  followFeed({ feed: chatFeed(sessionId), after: afterSeq, read: chatEventOf, onEvent })

const openSession =
  (calls: ChatCalls): ChatTransport["open"] =>
  (sessionId, onPage, onEvent) => {
    let live = true
    let unsubscribe: Unsubscribe = noop
    void calls
      .transcript(sessionId, { limit: TRANSCRIPT_TURNS })
      .catch(() => emptyTranscriptPage(sessionId))
      .then((page) => {
        if (!live) return
        onPage(page)
        unsubscribe = subscribeToEvents(sessionId, page.last_seq, onEvent)
      })
    return () => {
      live = false
      unsubscribe()
    }
  }

export const chatTransport = (calls: ChatCalls): ChatTransport => ({
  open: openSession(calls),
  transcript: (sessionId, beforeSeq) => calls.transcript(sessionId, { before_seq: beforeSeq, limit: TRANSCRIPT_TURNS }),
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
