import { useNow, useTranslations } from "use-intl"
import type { ReviewDetail, ReviewId, ReviewQueueItem } from "@/domain"
import { Empty, Heading, NODE_KIND, Surface, Tag, Text } from "@/components/studio"
import { useRichTags } from "@/i18n/format"
import { DecisionForm } from "./decision-form"
import { EvidenceColumn } from "./evidence-column"
import { SLA, detailMeta, nextItemId, slaState, slaSummary, triggerBadge } from "./presenters"
import { reviewEvidence } from "./review-sections"
import type { NoteDrafts } from "./use-note-drafts"

export type ReviewDetailSlotProps = {
  readonly queue: readonly ReviewQueueItem[]
  readonly itemId: ReviewId | null
  readonly detail: ReviewDetail | null
  readonly drafts: NoteDrafts
}

type ReviewDetailCardProps = Omit<ReviewDetailSlotProps, "itemId" | "detail"> & {
  readonly item: ReviewQueueItem
  readonly detail: ReviewDetail
}

function ReviewDetailCard({ queue, item, detail, drafts }: ReviewDetailCardProps) {
  const t = useTranslations("review")
  const common = useTranslations("common")
  const state = slaState(item.sla, useNow())
  const { b: strong } = useRichTags({ role: "note", weight: "semibold" })
  const evidence = reviewEvidence(detail, item, { t, common, strong })
  return (
    <Surface variant="raised" padding="lg">
      <Heading
        size="item"
        wrap
        leading={<Tag tone={NODE_KIND.human.tone}>{triggerBadge(item, t)}</Tag>}
        title={item.nodeId}
        description={<Text role="hint">{detailMeta(item, detail, t)}</Text>}
        trailing={
          <Text role="body" tone={SLA[state.kind].detail}>
            {slaSummary(item.sla, state, { t, common })}
          </Text>
        }
      />
      <div className="mt-3.25 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2.5">
        {evidence.map((section) => (
          <EvidenceColumn key={section.id} section={section} />
        ))}
      </div>
      <DecisionForm item={item} next={nextItemId(queue, item.id)} drafts={drafts} />
    </Surface>
  )
}

const missingKey = (itemId: ReviewId | null): "empty.review" | "empty.reviewNotFound" => (itemId === null ? "empty.review" : "empty.reviewNotFound")

export function ReviewDetailSlot({ queue, itemId, detail, drafts }: ReviewDetailSlotProps) {
  const common = useTranslations("common")
  const item = queue.find((entry) => entry.id === itemId)
  if (item === undefined || detail === null) return <Empty title={common(missingKey(itemId))} />
  return <ReviewDetailCard queue={queue} item={item} detail={detail} drafts={drafts} />
}
