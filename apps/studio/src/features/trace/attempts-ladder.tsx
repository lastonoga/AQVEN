import { useEffect, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import type { Attempt, AttemptLadder as AttemptLadderData } from "@/domain"
import { Expander, Heading, OUTCOME_TONE, Rich, Surface, Tag, Text, Toolbar } from "@/components/studio"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useRichTags } from "@/i18n/format"
import { duration, usd } from "@/lib/format"
import type { Translator } from "@/i18n/translator"
import { attemptLines, ladderHead, reopenOnArrival } from "./attempts"

export type AttemptsLadderProps = { readonly ladder: AttemptLadderData; readonly t: Translator }

function AttemptCard({ attempt, t }: { readonly attempt: Attempt; readonly t: Translator }) {
  return (
    <Surface variant="panel" radius="md" padding="xs" accent="top-2" tone={OUTCOME_TONE[attempt.result]}>
      <Heading
        size="tiny"
        title={t("trace.attempts.attempt", { n: attempt.n })}
        trailing={
          <Text role="tiny" tone="neutral">
            {duration(attempt.durationS)}
          </Text>
        }
      />
      <div className="mt-1.5">
        {attemptLines(attempt, t).map((line, index) => (
          <Text key={index} as="div" role="small" tone="default">
            <Rich value={line} />
          </Text>
        ))}
      </div>
    </Surface>
  )
}

function useLadderOpen(anchor: string): readonly [boolean, (open: boolean) => void] {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  useEffect(
    () =>
      router.subscribe("onResolved", (event) => {
        setOpen(reopenOnArrival(anchor, event.toLocation.hash))
      }),
    [router, anchor],
  )
  return [open, setOpen]
}

export function AttemptsLadder({ ladder, t }: AttemptsLadderProps) {
  const head = ladderHead(ladder, t)
  const [open, setOpen] = useLadderOpen(head.id)
  const { b: bold } = useRichTags({ role: "tiny", weight: "bold" })
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <Surface variant="tray" asChild>
        <Toolbar size="sm" stack id={head.id} className="scroll-mt-3">
          <Heading
            size="tiny"
            wrap
            leading={<Tag tone={head.tone} size="micro" fill="tint">{head.status}</Tag>}
            title={head.title}
            description={<Text role="caption" tone="warning">{ladder.chain}</Text>}
            trailing={
              <CollapsibleTrigger asChild>
                <Expander open={open} label={head.toggle(open)} />
              </CollapsibleTrigger>
            }
          />
          <CollapsibleContent className="flex flex-col gap-2">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
              {ladder.attempts.map((attempt) => (
                <AttemptCard key={attempt.n} attempt={attempt} t={t} />
              ))}
            </div>
            <Text as="p" role="caption" tone="warning">
              {t.rich("trace.attempts.billed", { billed: usd(ladder.billedUsd), failed: usd(ladder.failedUsd), b: bold })}
            </Text>
          </CollapsibleContent>
        </Toolbar>
      </Surface>
    </Collapsible>
  )
}
