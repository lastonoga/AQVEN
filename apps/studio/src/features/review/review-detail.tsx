import { useNow, useTranslations } from "use-intl"
import type { ApiExecutionDetail, ApiJsonObject } from "@/domain"
import { Empty, Heading, NODE_KIND, Surface, Tag, Text } from "@/components/studio"
import { DecisionForm } from "./decision-form"
import { EvidenceColumn } from "./evidence-column"
import { addressLabel, DEADLINE, deadlineState, detailMeta, entryKey, timeoutSummary, waitBadge, type ReviewEntry } from "./presenters"
import { waitEvidence } from "./review-sections"

export type ReviewDetailSlotProps = {
  readonly entry: ReviewEntry | null
  readonly detail: ApiExecutionDetail | null
  readonly schema: ApiJsonObject | null
  readonly blobText?: string | undefined
}

function ReviewDetailCard({ entry, detail, schema, blobText }: { readonly entry: ReviewEntry; readonly detail: ApiExecutionDetail | null; readonly schema: ApiJsonObject | null; readonly blobText?: string | undefined }) {
  const t = useTranslations("review")
  const domain = useTranslations("domain")
  const state = deadlineState(entry.wait, useNow())
  const human = detail?.human ?? null
  const evidence = human === null ? [] : waitEvidence(human, t, blobText)
  return (
    <Surface variant="raised" padding="lg">
      <Heading
        size="item"
        wrap
        leading={<Tag tone={NODE_KIND.human.tone}>{waitBadge(entry.wait, domain)}</Tag>}
        title={addressLabel(entry.wait.address)}
        description={<Text role="hint">{detailMeta(entry, t)}</Text>}
        trailing={
          <Text role="body" tone={DEADLINE[state.kind].detail}>
            {timeoutSummary(entry.wait, state, { t, domain })}
          </Text>
        }
      />
      {evidence.length === 0 ? null : (
        <div className="mt-3.25 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2.5">
          {evidence.map((section) => (
            <EvidenceColumn key={section.id} section={section} />
          ))}
        </div>
      )}
      <DecisionForm key={entryKey(entry)} entry={entry} schema={schema} />
    </Surface>
  )
}

export function ReviewDetailSlot({ entry, detail, schema, blobText }: ReviewDetailSlotProps) {
  const common = useTranslations("common")
  if (entry === null) return <Empty title={common("empty.review")} />
  return <ReviewDetailCard entry={entry} detail={detail} schema={schema} blobText={blobText} />
}
