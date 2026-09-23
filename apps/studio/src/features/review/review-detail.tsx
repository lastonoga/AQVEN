import { useNow, useTranslations } from "use-intl"
import { Text } from "@/components/studio"
import { DecisionForm } from "./decision-form"
import { EvidenceColumn } from "./evidence-column"
import { DEADLINE, deadlineState, detailMeta, entryKey, timeoutSummary, type ReviewEntry } from "./presenters"
import { waitEvidence } from "./review-sections"
import type { WaitDetail } from "./waits-data"

export type WaitBodyProps = { readonly entry: ReviewEntry; readonly wait: WaitDetail; readonly onResolved: () => void }

export function WaitBody({ entry, wait, onResolved }: WaitBodyProps) {
  const t = useTranslations("review")
  const domain = useTranslations("domain")
  const state = deadlineState(entry.wait, useNow())
  const human = wait.detail?.human ?? null
  const evidence = human === null ? [] : waitEvidence(human, t, wait.blobText)
  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text role="hint">{detailMeta(entry, t)}</Text>
        <Text role="body" tone={DEADLINE[state.kind].detail}>
          {timeoutSummary(entry.wait, state, { t, domain })}
        </Text>
      </div>
      {evidence.map((section) => (
        <EvidenceColumn key={section.id} section={section} />
      ))}
      <DecisionForm key={entryKey(entry)} entry={entry} schema={wait.schema} onResolved={onResolved} />
    </div>
  )
}
