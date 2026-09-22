import { useEffect, useState } from "react"
import { AssistantRuntimeProvider, useExternalStoreRuntime, type AppendMessage, type ThreadMessageLike } from "@assistant-ui/react"
import type { ApiChatEvent, ApiChatSession } from "@/domain"
import { chatSessionId, clientOpId } from "@/data/ids"
import { applyChatEvent, EMPTY_TRANSCRIPT, isRunning, threadMessages, type ChatTranscript } from "./chat-events"
import type { ChatTransport } from "./chat-transport"
import { Thread } from "./thread"

export type ChatSessionProps = { readonly session: ApiChatSession; readonly transport: ChatTransport }

const appendText = (message: AppendMessage): string =>
  message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim()

const keepMessage = (message: ThreadMessageLike): ThreadMessageLike => message

export function ChatSession({ session, transport }: ChatSessionProps) {
  const [transcript, setTranscript] = useState<ChatTranscript>(EMPTY_TRANSCRIPT)
  const id = chatSessionId(session.session_id)

  useEffect(() => {
    const receive = (event: ApiChatEvent): void => {
      setTranscript((current) => applyChatEvent(current, event))
    }
    return transport.subscribe(id, 0, receive)
  }, [id, transport])

  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages: threadMessages(transcript),
    isRunning: isRunning(transcript),
    convertMessage: keepMessage,
    onNew: async (message: AppendMessage) => {
      await transport.send(id, appendText(message), clientOpId())
    },
    onCancel: async () => {
      await transport.interrupt(id)
    },
    onRespondToToolApproval: async ({ approvalId, approved, text }) => {
      await transport.respond(id, approvalId, approved ? "allow" : "deny", text ?? null)
    },
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread failure={transcript.failure} state={transcript.state} />
    </AssistantRuntimeProvider>
  )
}
