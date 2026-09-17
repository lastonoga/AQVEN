import type { ReactNode } from "react"
import { ThreadPrimitive, type MessageState } from "@assistant-ui/react"
import { ArrowDown } from "lucide-react"
import { useTranslations } from "use-intl"
import { Surface } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { AssistantMessage } from "./assistant-message"
import { Composer } from "./composer"
import { Hint } from "./hint"
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

export function Thread() {
  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
      <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-smooth">
        <div className="flex flex-col gap-4 px-3 pt-3.5 pb-4">
          <ThreadPrimitive.Messages>{({ message }) => MESSAGE_VIEW[message.role]}</ThreadPrimitive.Messages>
        </div>
        <Surface variant="plain" asChild>
          <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-auto">
            <ScrollToBottom />
            <Composer />
          </ThreadPrimitive.ViewportFooter>
        </Surface>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}
