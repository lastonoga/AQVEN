import { useEffect, useMemo, useRef, useState } from "react"
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ExternalThreadQueueAdapter,
  type ThreadMessageLike,
} from "@assistant-ui/react"
import type { ApiChatEvent, ApiChatSession, ApiChatTranscriptPage, ChatSessionId } from "@/domain"
import { chatSessionId, clientOpId } from "@/data/ids"
import { noop } from "@/lib/noop"
import { EMPTY_TRANSCRIPT, isRunning, threadMessages } from "./chat-events"
import { openHistory, prependPage, receiveEvent, type ChatHistory } from "./chat-history"
import type { ChatTransport } from "./chat-transport"
import { QuestionAnswerContext, type QuestionAnswerSubmit } from "./question-context"
import { ReasoningSpanContext } from "./reasoning-context"
import { Thread, type EarlierTurns } from "./thread"

export type ChatSessionProps = { readonly session: ApiChatSession; readonly transport: ChatTransport }

const appendText = (message: AppendMessage): string =>
  message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim()

const keepMessage = (message: ThreadMessageLike): ThreadMessageLike => message

type Dispatch = (message: AppendMessage) => void

const serverQueue = (dispatch: Dispatch): ExternalThreadQueueAdapter => ({
  items: [],
  steerItems: [],
  enqueue: dispatch,
  steer: dispatch,
  move: noop,
  edit: noop,
  remove: noop,
})

type HistoryUpdate = (current: ChatHistory | null) => ChatHistory | null

const withHistory =
  (update: (history: ChatHistory) => ChatHistory): HistoryUpdate =>
  (current) =>
    current === null ? current : update(current)

function useChatHistory(id: ChatSessionId, transport: ChatTransport): readonly [ChatHistory | null, EarlierTurns] {
  const [history, setHistory] = useState<ChatHistory | null>(null)
  const [loading, setLoading] = useState<number | null>(null)
  const requested = useRef<number | null>(null)

  useEffect(() => {
    const opened = (page: ApiChatTranscriptPage): void => {
      setHistory(openHistory(page))
    }
    const received = (event: ApiChatEvent): void => {
      setHistory(withHistory((current) => receiveEvent(current, event)))
    }
    return transport.open(id, opened, received)
  }, [id, transport])

  const before = history?.earlierBefore ?? null
  const load = (): void => {
    if (before === null || requested.current === before) return
    requested.current = before
    setLoading(before)
    void transport
      .transcript(id, before)
      .then((page) => {
        setHistory(withHistory((current) => prependPage(current, before, page)))
      })
      .catch(noop)
      .finally(() => {
        requested.current = null
        setLoading(null)
      })
  }

  return [history, { before, loading: loading !== null, load }]
}

export function ChatSession({ session, transport }: ChatSessionProps) {
  const id = chatSessionId(session.session_id)
  const [history, earlier] = useChatHistory(id, transport)
  const transcript = history?.transcript ?? EMPTY_TRANSCRIPT

  const queue = useMemo(
    () =>
      serverQueue((message) => {
        void transport.send(id, appendText(message), clientOpId())
      }),
    [id, transport],
  )

  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages: threadMessages(transcript),
    isRunning: isRunning(transcript),
    convertMessage: keepMessage,
    queue,
    onNew: async (message: AppendMessage) => {
      await transport.send(id, appendText(message), clientOpId())
    },
    onCancel: async () => {
      await transport.interrupt(id)
    },
    onRespondToToolApproval: async ({ approvalId, approved, text }) => {
      await transport.respond(id, approvalId, { decision: approved ? "allow" : "deny", message: text ?? null })
    },
  })

  const answer: QuestionAnswerSubmit = async (approvalId, answers) => {
    await transport.respond(id, approvalId, { decision: "allow", message: null, answers })
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <QuestionAnswerContext value={answer}>
        <ReasoningSpanContext value={transcript.reasoning}>
          <Thread failure={transcript.failure} state={transcript.state} queued={transcript.queued} earlier={earlier} />
        </ReasoningSpanContext>
      </QuestionAnswerContext>
    </AssistantRuntimeProvider>
  )
}
