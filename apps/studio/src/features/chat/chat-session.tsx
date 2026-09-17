import { AssistantRuntimeProvider, AuiConfig, Tools, useLocalRuntime } from "@assistant-ui/react"
import { useTranslations } from "use-intl"
import type { ChatThread } from "@/domain"
import { chatBackend } from "./backend"
import { importThread } from "./history"
import { Thread } from "./thread"
import { studioToolkit } from "./toolkit"

const CHAT_CONFIG = AuiConfig({ tools: Tools({ toolkit: studioToolkit }) })

export function ChatSession({ thread }: { readonly thread: ChatThread }) {
  const t = useTranslations("chat")
  const runtime = useLocalRuntime(chatBackend.model({ fixtureReply: t("fixtureReply") }), {
    initialMessages: importThread(thread),
    adapters: { dictation: chatBackend.dictation() },
  })
  return (
    <AssistantRuntimeProvider runtime={runtime} config={CHAT_CONFIG}>
      <Thread />
    </AssistantRuntimeProvider>
  )
}
