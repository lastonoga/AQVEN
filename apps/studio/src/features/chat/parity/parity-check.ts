import type { ThreadMessageLike } from "@assistant-ui/react"
import type { ApiChatEvent, ApiChatTranscriptPage } from "@/domain"
import { isRecord } from "@/lib/sse"
import {
  applyChatEvents,
  EMPTY_TRANSCRIPT,
  threadMessages,
  type ChatFailure,
  type ChatState,
  type ChatTranscript,
  type QueuedMessage,
  type ReasoningSpans,
} from "../chat-events"
import { openHistory, prependPage, receiveEvent, type ChatHistory } from "../chat-history"

export type ParityCut = { readonly at_seq: number; readonly pages: readonly ApiChatTranscriptPage[] }

export type ParityJournal = {
  readonly name: string
  readonly limit: number
  readonly events: readonly ApiChatEvent[]
  readonly cuts: readonly ParityCut[]
}

export type ParityFixture = { readonly journals: readonly ParityJournal[] }

export type ThreadView = {
  readonly messages: readonly ThreadMessageLike[]
  readonly reasoning: ReasoningSpans
  readonly thinkingNow: boolean
  readonly queued: readonly QueuedMessage[]
  readonly state: ChatState
  readonly failure: ChatFailure | null
  readonly lastSeq: number
}

export type ParityCase<T> = { readonly label: string; readonly expected: T; readonly actual: T }

export type CompleteView = {
  readonly transcript: ChatTranscript
  readonly messages: readonly ThreadMessageLike[]
  readonly earlierBefore: number | null
}

export type ParityReport = {
  readonly windows: readonly ParityCase<ThreadView>[]
  readonly complete: readonly ParityCase<CompleteView>[]
}

const replayed = (events: readonly ApiChatEvent[]): ChatTranscript => applyChatEvents(EMPTY_TRANSCRIPT, events)

const thinkingNow = (spans: ReasoningSpans): boolean => Object.values(spans).some((span) => span.endedAt === null)

const spansOf = (spans: ReasoningSpans, messages: readonly ThreadMessageLike[]): ReasoningSpans =>
  Object.fromEntries(
    messages.flatMap((message) => {
      const span = message.id === undefined ? undefined : spans[message.id]
      return span === undefined || message.id === undefined ? [] : [[message.id, span]]
    }),
  )

const view = (transcript: ChatTranscript, messages: readonly ThreadMessageLike[]): ThreadView => ({
  messages,
  reasoning: spansOf(transcript.reasoning, messages),
  thinkingNow: thinkingNow(transcript.reasoning),
  queued: transcript.queued,
  state: transcript.state,
  failure: transcript.failure,
  lastSeq: transcript.lastSeq,
})

const windowCase = (label: string, reference: ChatTranscript, actual: ChatTranscript): ParityCase<ThreadView> => {
  const shown = threadMessages(actual)
  const all = threadMessages(reference)
  return { label, expected: view(reference, all.slice(all.length - shown.length)), actual: view(actual, shown) }
}

const completeView = (transcript: ChatTranscript, earlierBefore: number | null): CompleteView => ({
  transcript,
  messages: threadMessages(transcript),
  earlierBefore,
})

const prepended = (live: ChatHistory, older: readonly ApiChatTranscriptPage[]): readonly ChatHistory[] =>
  older.reduce<readonly ChatHistory[]>((steps, page) => {
    const last = steps[steps.length - 1] ?? live
    return [...steps, prependPage(last, last.earlierBefore ?? 0, page)]
  }, [live])

const cutReport = (journal: ParityJournal, cut: ParityCut): ParityReport => {
  const [newest, ...older] = cut.pages
  if (newest === undefined) return { windows: [], complete: [] }
  const label = `${journal.name}@${String(cut.at_seq)}`
  const full = replayed(journal.events)
  const reloaded = openHistory(newest)
  const live = journal.events.filter((event) => event.seq > cut.at_seq).reduce(receiveEvent, reloaded)
  const steps = prepended(live, older)
  const loaded = steps[steps.length - 1] ?? live
  return {
    windows: [
      windowCase(`${label} reload`, replayed(journal.events.filter((event) => event.seq <= cut.at_seq)), reloaded.transcript),
      ...steps.map((history, index) => windowCase(`${label} tail + ${String(index)} earlier pages`, full, history.transcript)),
    ],
    complete: [{ label: `${label} all pages`, expected: completeView(full, null), actual: completeView(loaded.transcript, loaded.earlierBefore) }],
  }
}

export const parityReport = (fixture: ParityFixture): ParityReport => {
  const reports = fixture.journals.flatMap((journal) => journal.cuts.map((cut) => cutReport(journal, cut)))
  return {
    windows: reports.flatMap((report) => report.windows),
    complete: reports.flatMap((report) => report.complete),
  }
}

const isCut = (value: unknown): value is ParityCut => isRecord(value) && typeof value["at_seq"] === "number" && Array.isArray(value["pages"])

const isJournal = (value: unknown): value is ParityJournal =>
  isRecord(value) &&
  typeof value["name"] === "string" &&
  typeof value["limit"] === "number" &&
  Array.isArray(value["events"]) &&
  Array.isArray(value["cuts"]) &&
  value["cuts"].every(isCut)

const isFixture = (value: unknown): value is ParityFixture => isRecord(value) && Array.isArray(value["journals"]) && value["journals"].every(isJournal)

export const parityFixture = (text: string): ParityFixture => {
  const parsed: unknown = JSON.parse(text)
  if (!isFixture(parsed)) throw new Error("the text is not a transcript parity fixture")
  return parsed
}
