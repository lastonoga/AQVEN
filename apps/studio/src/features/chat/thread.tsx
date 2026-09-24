import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react"
import { ThreadPrimitive, useAuiState, type MessageState } from "@assistant-ui/react"
import { ArrowDown } from "lucide-react"
import { useTranslations } from "use-intl"
import { Dot, Surface, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { AssistantMessage } from "./assistant-message"
import type { ChatFailure, ChatState, QueuedMessage } from "./chat-events"
import { Composer } from "./composer"
import { ContinuationNote } from "./continuation-note"
import { Hint } from "./hint"
import { QueuedMessages } from "./queued-messages"
import { useThinkingNow } from "./reasoning-context"
import { UserMessage } from "./user-message"

const MESSAGE_VIEW: Readonly<Record<MessageState["role"], ReactNode>> = {
  user: <UserMessage />,
  assistant: <AssistantMessage />,
  system: <ContinuationNote />,
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

export type EarlierTurns = {
  readonly before: number | null
  readonly loading: boolean
  readonly load: () => void
}

const EARLIER_MARGIN = "600px 0px 0px 0px"

type Anchor = { readonly element: Element; readonly offset: number }

const topWithin = (element: Element, viewport: Element): number =>
  element.getBoundingClientRect().top - viewport.getBoundingClientRect().top

const anchorBelow = (sentinel: Element, viewport: Element | null): Anchor | null => {
  const element = sentinel.nextElementSibling
  if (element === null || viewport === null) return null
  return { element, offset: topWithin(element, viewport) }
}

const keepAnchor = (anchor: Anchor | null, viewport: HTMLElement | null): void => {
  if (anchor === null || viewport === null || !anchor.element.isConnected) return
  viewport.scrollTo({ top: viewport.scrollTop + topWithin(anchor.element, viewport) - anchor.offset, behavior: "instant" })
}

type EarlierTurnsProps = { readonly earlier: EarlierTurns; readonly viewport: RefObject<HTMLDivElement | null> }

function EarlierTurnsLoader({ earlier, viewport }: EarlierTurnsProps) {
  const t = useTranslations("chat.thread")
  const sentinel = useRef<HTMLDivElement>(null)
  const anchor = useRef<Anchor | null>(null)
  const load = useRef(earlier.load)
  const firstMessage = useAuiState((state) => state.thread.messages[0]?.id ?? null)

  useLayoutEffect(() => {
    load.current = earlier.load
  })

  useLayoutEffect(() => {
    keepAnchor(anchor.current, viewport.current)
    anchor.current = null
  }, [firstMessage, viewport])

  useEffect(() => {
    const target = sentinel.current
    if (earlier.before === null || target === null || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        anchor.current = anchorBelow(target, viewport.current)
        load.current()
      },
      { root: viewport.current, rootMargin: EARLIER_MARGIN },
    )
    observer.observe(target)
    return () => {
      observer.disconnect()
    }
  }, [earlier.before, viewport])

  if (earlier.before === null) return null
  return (
    <div ref={sentinel} data-slot="earlier-turns" className="flex min-h-px justify-center">
      {earlier.loading ? <Spinner aria-label={t("loadingEarlier")} className="text-muted-foreground" /> : null}
    </div>
  )
}

export type ThreadProps = {
  readonly failure: ChatFailure | null
  readonly state: ChatState
  readonly queued: readonly QueuedMessage[]
  readonly earlier: EarlierTurns
}

export function Thread({ failure, state, queued, earlier }: ThreadProps) {
  const viewport = useRef<HTMLDivElement>(null)
  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
      <ThreadPrimitive.Viewport ref={viewport} className="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-smooth">
        <div className="flex flex-col gap-4 px-3 pt-3.5 pb-4">
          <EarlierTurnsLoader earlier={earlier} viewport={viewport} />
          <ThreadPrimitive.Messages>{({ message }) => MESSAGE_VIEW[message.role]}</ThreadPrimitive.Messages>
          <QueuedMessages queued={queued} />
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
