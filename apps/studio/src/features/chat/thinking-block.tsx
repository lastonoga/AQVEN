import { useEffect, useState } from "react"
import { useAuiState, type ReasoningMessagePartProps } from "@assistant-ui/react"
import { useTranslations } from "use-intl"
import { DisclosureChevron, Dot, Text } from "@/components/studio"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { ReasoningSpan } from "./chat-events"
import { useReasoningSpan } from "./reasoning-context"
import { compactTokens } from "./turn-usage"

const TICK_MS = 1000

const useNow = (live: boolean): number => {
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => {
      setNow(Date.now())
    }, TICK_MS)
    return () => {
      clearInterval(timer)
    }
  }, [live])
  return now
}

const elapsedSeconds = (span: ReasoningSpan, now: number): number =>
  Math.max(0, Math.round(((span.endedAt ?? now) - span.startedAt) / TICK_MS))

function ThinkingLabel({ span }: { readonly span: ReasoningSpan }) {
  const t = useTranslations("chat.thinking")
  const live = span.endedAt === null
  const seconds = String(elapsedSeconds(span, useNow(live)))
  return (
    <>
      {live ? <Dot tone="primary" pulse /> : null}
      <Text role="hint" tone="neutral">
        {live ? t("running", { seconds }) : t("done", { seconds })}
      </Text>
      {live || span.tokens === 0 ? null : (
        <Text role="hint" tone="neutral">
          {t("tokens", { tokens: compactTokens(span.tokens) })}
        </Text>
      )}
      <DisclosureChevron />
    </>
  )
}

function ThinkingText({ text }: { readonly text: string }) {
  return (
    <Text as="div" role="hint" tone="neutral" className="pt-1 whitespace-pre-wrap">
      {text}
    </Text>
  )
}

export function ThinkingBlock({ text }: ReasoningMessagePartProps) {
  const t = useTranslations("chat.thinking")
  const messageId = useAuiState((state) => state.message.id)
  const span = useReasoningSpan(messageId)
  if (span === null) return <ThinkingText text={text} />
  return (
    <Collapsible className="min-w-0">
      <CollapsibleTrigger aria-label={t("toggleAria")} className="flex min-w-0 items-center gap-1.5 text-left">
        <ThinkingLabel span={span} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ThinkingText text={text} />
      </CollapsibleContent>
    </Collapsible>
  )
}
