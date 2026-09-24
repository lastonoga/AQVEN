import type { ApiChatEvent, ApiChatTranscriptPage } from "@/domain"
import { applyChatEvent, applyChatEvents, EMPTY_TRANSCRIPT, type ChatTranscript } from "./chat-events"

type LiveLog = { readonly event: ApiChatEvent; readonly before: LiveLog | null }

export type ChatHistory = {
  readonly carry: readonly ApiChatEvent[]
  readonly folded: readonly ApiChatEvent[]
  readonly coveredSeq: number
  readonly live: LiveLog | null
  readonly earlierBefore: number | null
  readonly transcript: ChatTranscript
}

export const emptyTranscriptPage = (sessionId: string): ApiChatTranscriptPage => ({
  session_id: sessionId,
  turns: [],
  carry: [],
  last_seq: 0,
  before_seq: null,
})

const pageEvents = (page: ApiChatTranscriptPage): readonly ApiChatEvent[] => page.turns.flatMap((turn) => turn.events)

const logged = (log: LiveLog | null): readonly ApiChatEvent[] => {
  const events: ApiChatEvent[] = []
  for (let node = log; node !== null; node = node.before) events.push(node.event)
  return events.reverse()
}

const covered = (transcript: ChatTranscript, seq: number): ChatTranscript => ({ ...transcript, lastSeq: Math.max(transcript.lastSeq, seq) })

const replay = (carry: readonly ApiChatEvent[], folded: readonly ApiChatEvent[], coveredSeq: number, live: LiveLog | null): ChatTranscript =>
  applyChatEvents(covered(applyChatEvents(EMPTY_TRANSCRIPT, [...carry, ...folded]), coveredSeq), logged(live))

export const openHistory = (page: ApiChatTranscriptPage): ChatHistory => {
  const folded = pageEvents(page)
  return {
    carry: page.carry,
    folded,
    coveredSeq: page.last_seq,
    live: null,
    earlierBefore: page.before_seq,
    transcript: replay(page.carry, folded, page.last_seq, null),
  }
}

export const receiveEvent = (history: ChatHistory, event: ApiChatEvent): ChatHistory => {
  if (event.seq <= history.transcript.lastSeq) return history
  return { ...history, live: { event, before: history.live }, transcript: applyChatEvent(history.transcript, event) }
}

export const prependPage = (history: ChatHistory, requestedBefore: number, page: ApiChatTranscriptPage): ChatHistory => {
  if (requestedBefore !== history.earlierBefore) return history
  const folded = [...pageEvents(page), ...history.folded]
  return {
    ...history,
    carry: page.carry,
    folded,
    earlierBefore: page.before_seq,
    transcript: replay(page.carry, folded, history.coveredSeq, history.live),
  }
}
