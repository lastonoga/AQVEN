import { useEffect, useMemo, useState } from "react"
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ExternalThreadQueueAdapter,
  type ThreadMessageLike,
} from "@assistant-ui/react"
import type { ApiChatEvent, ApiChatSession } from "@/domain"
import { chatSessionId, clientOpId } from "@/data/ids"
import { noop } from "@/lib/noop"
import { applyChatEvent, EMPTY_TRANSCRIPT, isRunning, threadMessages, type ChatTranscript } from "./chat-events"
import type { ChatTransport } from "./chat-transport"
import { QuestionAnswerContext, type QuestionAnswerSubmit } from "./question-context"
import { ReasoningSpanContext } from "./reasoning-context"
import { Thread } from "./thread"

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

export function ChatSession({ session, transport }: ChatSessionProps) {
  const [transcript, setTranscript] = useState<ChatTranscript>(EMPTY_TRANSCRIPT)
  const id = chatSessionId(session.session_id)

  useEffect(() => {
    const receive = (event: ApiChatEvent): void => {
      setTranscript((current) => applyChatEvent(current, event))
    }
    return transport.subscribe(id, 0, receive)
  }, [id, transport])

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
          <Thread failure={transcript.failure} state={transcript.state} queued={transcript.queued} />
        </ReasoningSpanContext>
      </QuestionAnswerContext>
    </AssistantRuntimeProvider>
  )
}
