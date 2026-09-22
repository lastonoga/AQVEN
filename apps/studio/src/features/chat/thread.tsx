import type { ReactNode } from "react"
import { ThreadPrimitive, type MessageState } from "@assistant-ui/react"
import { ArrowDown } from "lucide-react"
import { useTranslations } from "use-intl"
import { Dot, Surface, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { AssistantMessage } from "./assistant-message"
import type { ChatFailure, ChatState } from "./chat-events"
import { Composer } from "./composer"
import { Hint } from "./hint"
import { useThinkingNow } from "./reasoning-context"
import { UserMessage } from "./user-message"

const MESSAGE_VIEW: Readonly<Record<MessageState["role"], ReactNode>> = {
  user: <UserMessage />,
  assistant: <AssistantMessage />,
  system: null,
}

function ScrollToBottom() {
  const t = useTranslations("chat.thread")
  return (
    <Hint label={t("scrollToBottomAria")}>
      <ThreadPrimitive.ScrollToBottom asChild>
        <Button
          variant="outline"
          size="icon-round"
          aria-label={t("scrollToBottomAria")}
          className="absolute -top-10 left-1/2 -translate-x-1/2 shadow-sm disabled:invisible"
        >
          <ArrowDown />
        </Button>
      </ThreadPrimitive.ScrollToBottom>
    </Hint>
  )
}

const QUIET: readonly ChatState[] = ["idle", "waiting_approval"]

function ThreadLoader({ state }: { readonly state: ChatState }) {
  const t = useTranslations("chat.loader")
  const thinking = useThinkingNow()
  if (thinking || QUIET.includes(state)) return null
  return (
    <Text role="hint" tone="neutral" asChild>
      <p role="status" aria-label={t("aria")} className="flex items-center gap-1.5 px-3.5 pb-1">
        <Dot tone="primary" pulse />
        {t("working")}
      </p>
    </Text>
  )
}

function ThreadFailure({ failure }: { readonly failure: ChatFailure | null }) {
  const t = useTranslations("chat")
  if (failure === null) return null
  return (
    <Text role="hint" tone="destructive" asChild>
      <p role="alert" className="px-3.5 pt-2">
        {t(`error.${failure.code}`)}
      </p>
    </Text>
  )
}

export function Thread({ failure, state }: { readonly failure: ChatFailure | null; readonly state: ChatState }) {
  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
      <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-smooth">
        <div className="flex flex-col gap-4 px-3 pt-3.5 pb-4">
          <ThreadPrimitive.Messages>{({ message }) => MESSAGE_VIEW[message.role]}</ThreadPrimitive.Messages>
        </div>
        <Surface variant="plain" asChild>
          <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-auto">
            <ScrollToBottom />
            <ThreadLoader state={state} />
            <ThreadFailure failure={failure} />
            <Composer />
          </ThreadPrimitive.ViewportFooter>
        </Surface>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}
